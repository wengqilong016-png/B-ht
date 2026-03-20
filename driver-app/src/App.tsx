import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, checkOnline } from './supabaseClient';
import { Driver } from './types';
import { flushQueue } from './offlineQueue';
import LoginPage from './pages/LoginPage';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage';
import CollectPage from './pages/CollectPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import BottomNav from './components/BottomNav';
import OfflineBanner from './components/OfflineBanner';

type Page = 'collect' | 'history' | 'profile';

const pushGpsHeartbeat = async (driverId: string) => {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      await supabase
        .from('drivers')
        .update({
          lastActive: new Date().toISOString(),
          currentGps: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        })
        .eq('id', driverId);
    },
    (err) => console.warn('[GPS] Error getting coordinates:', err.message, '(code:', err.code, ')'),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 15000 }
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<Driver | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('collect');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingDriverId, setPendingDriverId] = useState<string>('');

  const gpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load driver profile from drivers table
  const loadDriverProfile = useCallback(async (authUserId: string): Promise<Driver | null> => {
    // First get driver_id from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('driver_id, display_name')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (profileError || !profile?.driver_id) return null;

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, username, phone, remainingDebt, dailyFloatingCoins, status, currentGps')
      .eq('id', profile.driver_id)
      .maybeSingle();

    if (driverError || !driver) return null;

    return {
      id: driver.id,
      name: driver.name || profile.display_name || '',
      username: driver.username || '',
      phone: driver.phone || '',
      remainingDebt: driver.remainingDebt ?? 0,
      dailyFloatingCoins: driver.dailyFloatingCoins ?? 0,
      status: driver.status || 'active',
      currentGps: driver.currentGps,
    };
  }, []);

  // Check must_change_password for a session user; returns true if forced change needed
  const checkMustChangePassword = useCallback(async (authUserId: string, driver: Driver | null): Promise<boolean> => {
    const { data: profileFlags } = await supabase
      .from('profiles')
      .select('must_change_password, driver_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (profileFlags?.must_change_password && driver) {
      setMustChangePassword(true);
      setPendingDriverId(driver.id);
      return true;
    }
    return false;
  }, []);

  // Auth init
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;

      if (sessionUser && mounted) {
        const driver = await loadDriverProfile(sessionUser.id);
        if (mounted) {
          const forced = await checkMustChangePassword(sessionUser.id, driver);
          if (!forced) setCurrentUser(driver);
        }
      }

      if (mounted) setIsLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser(null);
        setMustChangePassword(false);
        setPendingDriverId('');
        return;
      }
      if (session?.user) {
        const driver = await loadDriverProfile(session.user.id);
        if (mounted) {
          const forced = await checkMustChangePassword(session.user.id, driver);
          if (!forced) setCurrentUser(driver);
        }
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadDriverProfile, checkMustChangePassword]);

  // Online detection
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setOfflineBannerDismissed(false);
      if (currentUser) {
        await flushQueue(supabase);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser]);

  // Health check every 15 seconds
  useEffect(() => {
    healthTimerRef.current = setInterval(async () => {
      const online = await checkOnline();
      setIsOnline(online);
      if (online && currentUser) {
        await flushQueue(supabase);
      }
    }, 15_000);

    return () => {
      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
    };
  }, [currentUser]);

  // GPS heartbeat every 30 seconds when online
  useEffect(() => {
    if (!currentUser || !isOnline) {
      if (gpsTimerRef.current) clearInterval(gpsTimerRef.current);
      return;
    }

    pushGpsHeartbeat(currentUser.id);
    gpsTimerRef.current = setInterval(() => {
      if (isOnline) pushGpsHeartbeat(currentUser.id);
    }, 30_000);

    return () => {
      if (gpsTimerRef.current) clearInterval(gpsTimerRef.current);
    };
  }, [currentUser, isOnline]);

  const handleLogin = useCallback((driver: Driver) => {
    setCurrentUser(driver);
  }, []);

  const handleMustChangePassword = useCallback((driverId: string, _authUserId: string) => {
    setPendingDriverId(driverId);
    setMustChangePassword(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }, []);

  const handleUserUpdate = useCallback((updated: Driver) => {
    setCurrentUser(updated);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <ForcePasswordChangePage
        onSuccess={() => {
          setMustChangePassword(false);
          setPendingDriverId('');
          // Re-trigger session check so currentUser is set after password change
          supabase.auth.getSession().then(({ data }) => {
            const user = data.session?.user;
            if (user) {
              loadDriverProfile(user.id).then((driver) => {
                if (driver) setCurrentUser(driver);
              });
            }
          });
        }}
      />
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} onMustChangePassword={handleMustChangePassword} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'collect':
        return <CollectPage driver={currentUser} isOnline={isOnline} />;
      case 'history':
        return <HistoryPage driver={currentUser} isOnline={isOnline} />;
      case 'profile':
        return (
          <ProfilePage
            driver={currentUser}
            isOnline={isOnline}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
          />
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100">
      {!isOnline && !offlineBannerDismissed && (
        <OfflineBanner onDismiss={() => setOfflineBannerDismissed(true)} />
      )}
      <main className="flex-1 overflow-y-auto pb-20">{renderPage()}</main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  );
}

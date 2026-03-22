import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

  const gpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load driver profile from drivers table (also returns mustChangePassword flag)
  const loadDriverProfile = useCallback(async (authUserId: string): Promise<{ driver: Driver | null; mustChangePassword: boolean }> => {
    // Get driver_id, display_name, and must_change_password from profiles in one query
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('driver_id, display_name, must_change_password')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (profileError || !profile?.driver_id) return { driver: null, mustChangePassword: false };

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, username, phone, remainingDebt, dailyFloatingCoins, status, currentGps')
      .eq('id', profile.driver_id)
      .maybeSingle();

    if (driverError || !driver) return { driver: null, mustChangePassword: false };

    return {
      driver: {
        id: driver.id,
        name: driver.name || profile.display_name || '',
        username: driver.username || '',
        phone: driver.phone || '',
        remainingDebt: driver.remainingDebt ?? 0,
        dailyFloatingCoins: driver.dailyFloatingCoins ?? 0,
        status: driver.status || 'active',
        currentGps: driver.currentGps,
      },
      mustChangePassword: profile.must_change_password === true,
    };
  }, []);

  // Auth init
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;

      if (sessionUser && mounted) {
        const { driver, mustChangePassword: forceChange } = await loadDriverProfile(sessionUser.id);
        if (mounted) {
          if (forceChange && driver) {
            setMustChangePassword(true);
          } else {
            setCurrentUser(driver);
          }
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
        
        return;
      }
      // USER_UPDATED fires when supabase.auth.updateUser() is called (e.g. by
      // ForcePasswordChangePage).  Re-checking must_change_password here races
      // against the clear_my_must_change_password RPC: a stale "true" response
      // arriving after onSuccess fires would re-lock the user on the change
      // screen.  Skip — ForcePasswordChangePage handles its own state transition.
      if (event === 'USER_UPDATED') return;
      if (session?.user) {
        const { driver, mustChangePassword: forceChange } = await loadDriverProfile(session.user.id);
        if (mounted) {
          if (forceChange && driver) {
            setMustChangePassword(true);
          } else {
            setCurrentUser(driver);
          }
        }
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadDriverProfile]);

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

  const handleMustChangePassword = useCallback(() => {
    setMustChangePassword(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }, []);

  const handleUserUpdate = useCallback((updated: Driver) => {
    setCurrentUser(updated);
  }, []);

  const pageElement = useMemo(() => {
    if (!currentUser) return null;
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
  }, [currentPage, currentUser, isOnline, handleLogout, handleUserUpdate]);

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
          
          // Re-trigger session check so currentUser is set after password change
          supabase.auth.getSession().then(({ data }) => {
            const user = data.session?.user;
            if (user) {
              loadDriverProfile(user.id).then(({ driver }) => {
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

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100">
      {!isOnline && !offlineBannerDismissed && (
        <OfflineBanner onDismiss={() => setOfflineBannerDismissed(true)} />
      )}
      <main className="flex-1 overflow-y-auto pb-20">{pageElement}</main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  );
}

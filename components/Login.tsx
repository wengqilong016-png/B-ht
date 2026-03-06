
import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Crown, RefreshCw } from 'lucide-react';
import { Driver, User as UserType, TRANSLATIONS, CONSTANTS } from '../types';
import { checkDbHealth } from '../supabaseClient';

const CACHED_CREDENTIALS_KEY = 'bahati_cached_creds';

interface LoginProps {
  drivers: Driver[];
  onLogin: (user: UserType) => void;
  lang: 'zh' | 'sw';
  onSetLang: (lang: 'zh' | 'sw') => void;
}

const Login: React.FC<LoginProps> = ({ drivers, onLogin, lang, onSetLang }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogging, setIsAutoLogging] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [cachedName, setCachedName] = useState<string | null>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    checkDbHealth().then(isOnline => setDbStatus(isOnline ? 'online' : 'offline'));
    
    // Attempt auto-login from cached credentials
    try {
      const raw = localStorage.getItem(CACHED_CREDENTIALS_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { username: string; password: string; name: string; role: string };
        if (cached.username && cached.password) {
          setCachedName(cached.name || cached.username);
          // Pre-fill fields so user can see what's cached
          setUsername(cached.username);
          setPassword(cached.password);
          // Auto-login after a brief delay (only for drivers, not admins)
          if (cached.role === 'driver') {
            setIsAutoLogging(true);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Auto-login effect — fires once drivers are available and isAutoLogging = true
  useEffect(() => {
    if (!isAutoLogging || drivers.length === 0) return;
    const raw = localStorage.getItem(CACHED_CREDENTIALS_KEY);
    if (!raw) { setIsAutoLogging(false); return; }
    try {
      const cached = JSON.parse(raw) as { username: string; password: string };
      attemptLogin(cached.username, cached.password, true);
    } catch (e) {
      setIsAutoLogging(false);
    }
  }, [isAutoLogging, drivers]);

  const cacheCredentials = (u: string, p: string, name: string, role: string) => {
    try {
      localStorage.setItem(CACHED_CREDENTIALS_KEY, JSON.stringify({ username: u, password: p, name, role }));
    } catch (e) { /* ignore */ }
  };

  const clearCache = () => {
    localStorage.removeItem(CACHED_CREDENTIALS_KEY);
    setCachedName(null);
    setUsername('');
    setPassword('');
    setIsAutoLogging(false);
  };

  const attemptLogin = async (u: string, p: string, silent = false) => {
    if (!silent) setError('');
    setIsLoading(true);

    if (!silent) await new Promise(resolve => setTimeout(resolve, 600));

    const userLower = u.toLowerCase();

    // Admin Master Login
    const validUsernames = [CONSTANTS.ADMIN_USERNAME.toLowerCase(), ...CONSTANTS.ADMIN_ALIASES];
    const validPasswords = [CONSTANTS.ADMIN_PASSWORD, ...CONSTANTS.ADMIN_PASSWORD_ALIASES];
    if (validUsernames.includes(userLower) && validPasswords.includes(p)) {
      cacheCredentials(userLower, p, 'Administrator', 'admin');
      onLogin({ id: 'ADMIN-MASTER', username: userLower, role: 'admin', name: 'Administrator' });
      setIsLoading(false);
      setIsAutoLogging(false);
      return;
    }

    const driver = drivers.find(d => d.username.toLowerCase() === userLower);
    if (driver) {
      if (driver.status === 'inactive') {
        setError(lang === 'zh' ? '账号已停用' : 'Account Disabled');
        clearCache();
      } else if (driver.password === p) {
        cacheCredentials(userLower, p, driver.name, 'driver');
        onLogin({ id: driver.id, username: driver.username, role: 'driver', name: driver.name });
      } else {
        setError(lang === 'zh' ? '密码错误' : 'Wrong Password');
        clearCache();
      }
    } else {
      if (!silent) setError(lang === 'zh' ? '账号不存在' : 'User Not Found');
      clearCache();
    }
    setIsLoading(false);
    setIsAutoLogging(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await attemptLogin(username, password);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex justify-between items-start z-30">
         <div className="flex gap-2">
            <button onClick={() => onSetLang('zh')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all backdrop-blur-md ${lang === 'zh' ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white/40 border border-white/10'}`}><Languages size={12}/> 中文</button>
            <button onClick={() => onSetLang('sw')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all backdrop-blur-md ${lang === 'sw' ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white/40 border border-white/10'}`}><Languages size={12}/> EN</button>
         </div>
         <div className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all backdrop-blur-md ${dbStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
            {dbStatus === 'checking' ? 'Connecting...' : dbStatus === 'online' ? 'Cloud Ready' : 'Local Mode'}
         </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-amber-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/40 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        <div className="mb-8 relative group">
           <div className="absolute inset-0 bg-amber-500 blur-2xl opacity-20 transition-opacity"></div>
           <div className="relative w-28 h-28 bg-gradient-to-b from-slate-800 to-slate-900 rounded-[30px] border-2 border-amber-500/30 flex items-center justify-center shadow-2xl">
              <span className="text-6xl drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">🦁</span>
              <div className="absolute -top-3 -right-3 bg-amber-500 text-slate-900 p-2 rounded-full border-4 border-slate-900 shadow-lg">
                 <Crown size={20} fill="currentColor" />
              </div>
           </div>
        </div>

        <div className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">BAHATI <span className="text-amber-500">JACKPOTS</span></h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Field Operations System</p>
        </div>

        {/* Auto-login banner */}
        {(isAutoLogging || isLoading) && cachedName && (
          <div className="w-full mb-4 p-4 bg-indigo-500/20 border border-indigo-500/30 rounded-2xl flex items-center gap-3 animate-pulse">
            <Loader2 size={16} className="text-indigo-400 animate-spin" />
            <div>
              <p className="text-xs font-black text-indigo-300">Auto-signing in as {cachedName}...</p>
              <button onClick={clearCache} className="text-[9px] text-indigo-400/70 underline">Use different account</button>
            </div>
          </div>
        )}

        {/* Cached account banner (not auto-logging) */}
        {cachedName && !isAutoLogging && !isLoading && (
          <div className="w-full mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-300">Saved: {cachedName}</span>
            </div>
            <button onClick={clearCache} className="p-1.5 bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
              <RefreshCw size={11} />
            </button>
          </div>
        )}

        <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl border border-white/10 w-full">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <User size={12} className="text-amber-500" /> {t.username}
              </label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-4 px-4 font-bold text-white focus:border-amber-500/50 outline-none transition-all" placeholder="ID Number" required />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Lock size={12} className="text-amber-500" /> {t.password}
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-4 px-4 font-black text-white focus:border-amber-500/50 outline-none transition-all" placeholder="••••••••" required />
            </div>
            
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                 <AlertCircle size={16} className="text-rose-500" />
                 <span className="text-rose-400 text-xs font-bold">{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all">
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>{t.loginBtn} <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

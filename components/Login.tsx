
import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Settings, Save, Database, X, Crown, Gamepad2 } from 'lucide-react';
import { Driver, User as UserType, TRANSLATIONS } from '../types';
import { saveSupabaseConfig, clearSupabaseConfig, checkDbHealth, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient';

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
  const t = TRANSLATIONS[lang];

  const [showConfig, setShowConfig] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
     setConfigUrl(localStorage.getItem('bahati_supa_url') || SUPABASE_URL);
     setConfigKey(localStorage.getItem('bahati_supa_key') || SUPABASE_ANON_KEY);
     checkDbHealth().then(isOnline => setDbStatus(isOnline ? 'online' : 'offline'));
  }, [showConfig]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 800));

    const userLower = username.toLowerCase();
    if ((userLower === '8888' || userLower === 'admin') && password === '0000') {
      onLogin({ id: 'ADMIN-MASTER', username: userLower, role: 'admin', name: 'Administrator' });
      setIsLoading(false);
      return;
    }
    
    const driver = drivers.find(d => d.username.toLowerCase() === userLower);
    if (driver) {
      if (driver.status === 'inactive') {
        setError(lang === 'zh' ? '账号已停用' : 'Akaunti imefungwa');
      } else if (driver.password === password) {
        onLogin({ id: driver.id, username: driver.username, role: 'driver', name: driver.name });
      } else {
        setError(lang === 'zh' ? '密码错误' : 'Nenosiri si sahihi');
      }
    } else {
      setError(lang === 'zh' ? '账号不存在' : 'Jina la mtumiaji halipo');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex justify-between items-start z-30">
         <div className="flex gap-2">
            <button onClick={() => onSetLang('zh')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all backdrop-blur-md ${lang === 'zh' ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white/40 border border-white/10'}`}><Languages size={12}/> 中文</button>
            <button onClick={() => onSetLang('sw')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all backdrop-blur-md ${lang === 'sw' ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-white/40 border border-white/10'}`}><Languages size={12}/> SW</button>
         </div>
         <button onClick={() => setShowConfig(true)} className={`p-2 rounded-full transition-all backdrop-blur-md ${dbStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-slate-400 border border-white/10'}`}>
           <Settings size={20} className={dbStatus === 'checking' ? 'animate-spin' : ''} />
         </button>
      </div>

      {/* Atmospheric Background matching "Lion Sunset" theme */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-amber-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/40 rounded-full blur-[100px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[200px] h-[200px] bg-yellow-500/10 rounded-full blur-[80px]"></div>
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        {/* Brand Icon */}
        <div className="mb-8 relative group">
           <div className="absolute inset-0 bg-amber-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
           <div className="relative w-28 h-28 bg-gradient-to-b from-slate-800 to-slate-900 rounded-[30px] border-2 border-amber-500/30 flex items-center justify-center shadow-2xl shadow-black/50">
              <div className="text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                 <span className="text-6xl">🦁</span>
              </div>
              <div className="absolute -top-3 -right-3 bg-amber-500 text-slate-900 p-2 rounded-full border-4 border-slate-900 shadow-lg">
                 <Crown size={20} fill="currentColor" />
              </div>
           </div>
        </div>

        <div className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight uppercase drop-shadow-lg">
            BAHATI <span className="text-amber-500">JACKPOTS</span>
          </h1>
          <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
             <span className="w-8 h-px bg-slate-700"></span>
             <span>Casino Adventure</span>
             <span className="w-8 h-px bg-slate-700"></span>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl border border-white/10 w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <User size={12} className="text-amber-500" /> {t.username}
              </label>
              <div className="relative group">
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-4 pl-4 pr-4 font-bold outline-none text-white focus:border-amber-500/50 transition-all placeholder:text-slate-600" placeholder="Enter Username" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Lock size={12} className="text-amber-500" /> {t.password}
              </label>
              <div className="relative group">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-4 pl-4 pr-4 font-black outline-none text-white focus:border-amber-500/50 transition-all placeholder:text-slate-600" placeholder="••••••••" />
              </div>
            </div>
            
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-1">
                 <AlertCircle size={16} className="text-rose-500" />
                 <span className="text-rose-400 text-xs font-bold">{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-black py-4 rounded-xl shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 mt-4 hover:brightness-110 active:scale-95 transition-all">
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>{t.loginBtn} <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>

      {showConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-slate-800 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-white/10">
              <div className="bg-slate-900 p-6 border-b border-white/10 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <Database size={20} className="text-amber-500" />
                    <div><h3 className="text-sm font-black uppercase text-white">连接设置 SERVER</h3></div>
                 </div>
                 <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-white/10 rounded-full text-slate-400"><X size={18}/></button>
              </div>
              <div className="p-6 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Supabase URL</label>
                    <input type="text" value={configUrl} onChange={e => setConfigUrl(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-amber-500/50 outline-none" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Anon Key</label>
                    <textarea value={configKey} onChange={e => setConfigKey(e.target.value)} className="w-full h-24 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-[9px] font-mono text-slate-300 focus:border-amber-500/50 outline-none" />
                 </div>
                 <div className="pt-2 flex flex-col gap-2">
                    <button onClick={() => saveSupabaseConfig(configUrl, configKey)} className="w-full py-3 bg-amber-500 text-slate-900 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 hover:brightness-110"><Save size={14} /> 保存并连接</button>
                    <button onClick={clearSupabaseConfig} className="w-full py-3 bg-transparent border border-rose-500/30 text-rose-400 rounded-xl text-xs font-black uppercase hover:bg-rose-500/10">重置为默认配置</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Login;

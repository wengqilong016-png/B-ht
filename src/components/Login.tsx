
import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Settings, Save, Database, X } from 'lucide-react';
import { Driver, User as UserType, TRANSLATIONS } from '../types';
import { saveSupabaseConfig, clearSupabaseConfig, checkDbHealth, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from '../supabaseClient';

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
     // If manual config exists, use it. Otherwise, show the default hardcoded ones as placeholder values.
     setConfigUrl(localStorage.getItem('bahati_supa_url') || DEFAULT_SUPABASE_URL);
     setConfigKey(localStorage.getItem('bahati_supa_key') || DEFAULT_SUPABASE_ANON_KEY);
     
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
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex justify-between items-start z-20">
         <div className="flex gap-2">
            <button onClick={() => onSetLang('zh')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${lang === 'zh' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/40'}`}><Languages size={12}/> 中文</button>
            <button onClick={() => onSetLang('sw')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${lang === 'sw' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/40'}`}><Languages size={12}/> SW</button>
         </div>
         <button onClick={() => setShowConfig(true)} className={`p-2 rounded-full transition-all ${dbStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-slate-400'}`}>
           <Settings size={20} className={dbStatus === 'checking' ? 'animate-spin' : ''} />
         </button>
      </div>

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex p-4 bg-white/5 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm relative">
            <ShieldCheck size={48} className="text-indigo-400" />
            <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${dbStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">BAHATI PRO</h1>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl border border-white/20">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.username}</label>
              <div className="relative group">
                <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-bold outline-none" placeholder="Username" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.password}</label>
              <div className="relative group">
                <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-black outline-none" placeholder="Password" />
              </div>
            </div>
            {error && <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold">{error}</div>}
            <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mt-4">
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>{t.loginBtn} <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>

      {showConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl">
              <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <Database size={20} className="text-indigo-600" />
                    <div><h3 className="text-sm font-black uppercase">连接设置 SERVER</h3></div>
                 </div>
                 <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={18}/></button>
              </div>
              <div className="p-6 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Supabase URL</label>
                    <input type="text" value={configUrl} onChange={e => setConfigUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Anon Key</label>
                    <textarea value={configKey} onChange={e => setConfigKey(e.target.value)} className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-mono" />
                 </div>
                 <div className="pt-2 flex flex-col gap-2">
                    <button onClick={() => saveSupabaseConfig(configUrl, configKey)} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2"><Save size={14} /> 保存并连接</button>
                    <button onClick={clearSupabaseConfig} className="w-full py-3 bg-white border border-rose-100 text-rose-500 rounded-xl text-xs font-black uppercase">重置为默认配置</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Login;

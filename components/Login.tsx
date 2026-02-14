
import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Settings, Save, Database, X } from 'lucide-react';
import { Driver, CONSTANTS, User as UserType, TRANSLATIONS } from '../types';
import { saveSupabaseConfig, clearSupabaseConfig, checkDbHealth } from '../supabaseClient';

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

  // Config Modal State
  const [showConfig, setShowConfig] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
     // Load existing config into modal inputs if available
     setConfigUrl(localStorage.getItem('bahati_supa_url') || '');
     setConfigKey(localStorage.getItem('bahati_supa_key') || '');
     
     // Check health
     checkDbHealth().then(isOnline => setDbStatus(isOnline ? 'online' : 'offline'));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 800));

    // Hardcoded Admin login check (supports '8888' or 'admin')
    const userLower = username.toLowerCase();
    if ((userLower === '8888' || userLower === 'admin') && password === '0000') {
      onLogin({ 
        id: 'ADMIN-MASTER', 
        username: userLower, 
        role: 'admin', 
        name: 'Administrator' 
      });
      setIsLoading(false);
      return;
    }
    
    const driver = drivers.find(d => d.username.toLowerCase() === userLower);
    
    if (driver) {
      if (driver.status === 'inactive') {
        setError(lang === 'zh' ? '该账号已被管理员停用' : 'Akaunti hii imefungwa na meneja');
        setIsLoading(false);
        return;
      }
      
      // If driver password is empty string, they can login with empty password
      if (driver.password === password) {
        const role = 'driver';
        onLogin({ id: driver.id, username: driver.username, role: role, name: driver.name });
      } else {
        setError(lang === 'zh' ? '密码错误' : 'Nenosiri si sahihi');
      }
    } else {
      setError(lang === 'zh' ? '账号不存在' : 'Jina la mtumiaji halipo');
    }
    
    setIsLoading(false);
  };

  const handleSaveConfig = () => {
    if (configUrl && configKey) {
        saveSupabaseConfig(configUrl, configKey);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20">
         <div className="flex gap-2">
            <button onClick={() => onSetLang('zh')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${lang === 'zh' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/40'}`}>
              <Languages size={12}/> 中文
            </button>
            <button onClick={() => onSetLang('sw')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${lang === 'sw' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/40'}`}>
              <Languages size={12}/> SW
            </button>
         </div>
         <button 
           onClick={() => setShowConfig(true)} 
           className={`p-2 rounded-full transition-all ${dbStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-slate-400 hover:text-white'}`}
         >
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
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">BAHATI JACKPOTS</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-2">
              {lang === 'zh' ? '专业运营管理系统' : 'MFUMO WA USIMAMIZI WA BIASHARA'}
            </p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl border border-white/20">
          <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
            {t.login}
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full uppercase">Secure</span>
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.username}</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <User size={20} />
                </div>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-300"
                  placeholder={lang === 'zh' ? "账号 (例如: 8888)" : "Jina (Mfano: 8888)"}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t.password}</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <Lock size={20} />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-black text-slate-900 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-300 tracking-widest"
                  placeholder={lang === 'zh' ? "密码" : "Nenosiri"}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-xs font-bold animate-in slide-in-from-left-2">
                <AlertCircle size={14} className="flex-shrink-0" /> {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <>{t.loginBtn} <ArrowRight size={20} /></>}
            </button>
          </form>
        </div>
      </div>

      {/* Cloud Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl">
              <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Database size={20} /></div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase">服务器配置</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Server Connection</p>
                    </div>
                 </div>
                 <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X size={18}/></button>
              </div>
              <div className="p-6 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Supabase URL</label>
                    <input type="text" value={configUrl} onChange={e => setConfigUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none" placeholder="https://..." />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Supabase Anon Key</label>
                    <input type="text" value={configKey} onChange={e => setConfigKey(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none" placeholder="eyJ..." />
                 </div>
                 
                 <div className="pt-2 flex flex-col gap-2">
                    <button onClick={handleSaveConfig} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg">
                       <Save size={14} /> 保存并连接 (Connect)
                    </button>
                    {configUrl && (
                      <button onClick={clearSupabaseConfig} className="w-full py-3 bg-white border border-rose-100 text-rose-500 rounded-xl text-xs font-black uppercase">
                         重置配置 (Reset)
                      </button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Login;

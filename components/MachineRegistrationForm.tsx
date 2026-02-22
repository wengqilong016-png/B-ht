
import React, { useState, useRef } from 'react';
import { Camera, MapPinned, Loader2, CheckCircle2, User, Phone, MapPin, Building2, Coins, Save, ImagePlus, X, Percent, ArrowLeft, ArrowRight } from 'lucide-react';
import { Location, Driver, CONSTANTS } from '../types';

interface MachineRegistrationFormProps {
  onSubmit: (location: Location) => void;
  onCancel: () => void;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
}

const MachineRegistrationForm: React.FC<MachineRegistrationFormProps> = ({ onSubmit, onCancel, currentDriver, lang }) => {
  const [machineId, setMachineId] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [area, setArea] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [initialScore, setInitialScore] = useState('');
  const [startupDebt, setStartupDebt] = useState('');
  const [commissionRate, setCommissionRate] = useState((CONSTANTS.DEFAULT_PROFIT_SHARE * 100).toString());
  
  // Three Photos Requirement
  const [ownerMachinePhoto, setOwnerMachinePhoto] = useState<string | null>(null);
  const [machineOnlyPhoto, setMachineOnlyPhoto] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  
  // Interaction States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lastRegisteredMachine, setLastRegisteredMachine] = useState<Location | null>(null);
  
  const photoRefs = {
    owner: useRef<HTMLInputElement>(null),
    machine: useRef<HTMLInputElement>(null),
    id: useRef<HTMLInputElement>(null),
  };

  const fetchGps = () => {
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { 
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); 
        setIsGpsLoading(false); 
      },
      (err) => { 
        alert(lang === 'zh' ? "GPS 获取失败，必须获取定位才能注册。" : "GPS imeshindwa, ni lazima kupata eneo"); 
        setIsGpsLoading(false); 
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>, type: 'owner' | 'machine' | 'id') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scale = Math.min(1, MAX_WIDTH / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.6);
          if (type === 'owner') setOwnerMachinePhoto(base64);
          else if (type === 'machine') setMachineOnlyPhoto(base64);
          else setIdPhoto(base64);
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!machineId || !shopName || !area || !gps || !ownerName || !ownerPhone || !ownerMachinePhoto) {
      alert(lang === 'zh' ? "请填写所有必填项 (*)，且必须拍摄合影与获取 GPS。" : "Jaza nafasi zote, piga picha ya pamoja na washa GPS");
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    const debtValue = parseInt(startupDebt) || 0;
    const commValue = (parseFloat(commissionRate) || 15) / 100;

    const newLocation: Location = {
        id: crypto.randomUUID(),
        name: shopName,
        ownerName: ownerName,
        area: area,
        machineId: machineId,
        shopOwnerPhone: ownerPhone,
        lastScore: parseInt(initialScore) || 0,
        initialStartupDebt: debtValue,
        remainingStartupDebt: debtValue,
        isNewOffice: true,
        coords: gps,
        status: 'active',
        commissionRate: commValue,
        ownerPhotoUrl: ownerMachinePhoto || undefined,
        machinePhotoUrl: machineOnlyPhoto || undefined,
        idPhotoUrl: idPhoto || undefined,
        assignedDriverId: currentDriver.id,
        merchantBalance: 0
    };

    onSubmit(newLocation);
    setLastRegisteredMachine(newLocation);
    setIsSubmitting(false);
    setIsSuccess(true);
  };

  const handleReset = () => {
    setMachineId(''); setShopName(''); setOwnerName(''); setArea(''); setOwnerPhone('');
    setInitialScore(''); setStartupDebt(''); 
    setOwnerMachinePhoto(null); setMachineOnlyPhoto(null); setIdPhoto(null);
    setGps(null); setCommissionRate('15');
    setIsSuccess(false); setLastRegisteredMachine(null);
  };

  if (isSuccess && lastRegisteredMachine) {
    return (
      <div className="max-w-md mx-auto py-12 px-6 animate-in zoom-in-95 duration-500">
        <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden relative">
           <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-400 to-indigo-500"></div>
           
           <div className="p-8 flex flex-col items-center text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-2 shadow-inner">
                 <CheckCircle2 size={48} className="text-emerald-500 animate-in zoom-in spin-in-12 duration-700" />
              </div>
              
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                  {lang === 'zh' ? '入网成功！' : 'Usajili Umekamilika!'}
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase mt-1 tracking-widest">Successful Registration</p>
              </div>

              <div className="w-full bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-3">
                 <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">ID</span>
                    <span className="text-base font-black text-indigo-600">{lastRegisteredMachine.machineId}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Shop</span>
                    <span className="text-sm font-bold text-slate-700">{lastRegisteredMachine.name}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Area</span>
                    <span className="text-xs font-bold text-slate-500">{lastRegisteredMachine.area}</span>
                 </div>
              </div>

              <div className="w-full space-y-3 pt-4">
                 <button onClick={handleReset} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2">
                   <PlusButtonIcon />
                   {lang === 'zh' ? '继续注册下一台' : 'Sajili Mashine Nyingine'}
                 </button>
                 <button onClick={onCancel} className="w-full py-4 bg-white text-slate-500 border border-slate-200 rounded-2xl font-black uppercase text-sm hover:bg-slate-50 active:scale-95 transition-all">
                   {lang === 'zh' ? '返回管理概览' : 'Rudi Dashibodi'}
                 </button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24 px-4 animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-[40px] p-8 shadow-2xl border border-slate-200 space-y-6 relative">
        {/* Header */}
        <div className="border-b border-slate-100 pb-4 mb-2 flex items-center justify-between">
           <button onClick={onCancel} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-indigo-600 transition-colors">
              <ArrowLeft size={20} />
           </button>
           <div className="text-center">
             <h2 className="text-xl font-black text-slate-900 uppercase">
               {lang === 'zh' ? '新机入网注册' : 'Sajili Mashine Mpya'}
             </h2>
             <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Site Onboarding</p>
           </div>
           <div className="w-10"></div>
        </div>

        {/* Triple Photo Upload Section */}
        <div className="space-y-4">
           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{lang === 'zh' ? '现场存证 (多选照片) *' : 'Picha za Ushahidi *'}</label>
           
           <div className="grid grid-cols-3 gap-3">
              {/* Photo 1: Owner + Machine */}
              <div 
                onClick={() => photoRefs.owner.current?.click()}
                className={`relative h-32 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all ${ownerMachinePhoto ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}
              >
                 <input type="file" accept="image/*" capture="environment" ref={photoRefs.owner} onChange={(e) => handlePhotoCapture(e, 'owner')} className="hidden" />
                 {ownerMachinePhoto ? <img src={ownerMachinePhoto} className="w-full h-full object-cover grayscale" /> : (
                   <div className="text-center px-2">
                     <User size={18} className="text-slate-300 mx-auto mb-1" />
                     <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">{lang === 'zh' ? '老板合影*' : 'Picha ya Pamoja*'}</p>
                   </div>
                 )}
              </div>

              {/* Photo 2: Machine Only */}
              <div 
                onClick={() => photoRefs.machine.current?.click()}
                className={`relative h-32 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all ${machineOnlyPhoto ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
              >
                 <input type="file" accept="image/*" capture="environment" ref={photoRefs.machine} onChange={(e) => handlePhotoCapture(e, 'machine')} className="hidden" />
                 {machineOnlyPhoto ? <img src={machineOnlyPhoto} className="w-full h-full object-cover grayscale" /> : (
                   <div className="text-center px-2">
                     <Aperture size={18} className="text-slate-300 mx-auto mb-1" />
                     <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">{lang === 'zh' ? '单拍机器' : 'Mashine'}</p>
                   </div>
                 )}
              </div>

              {/* Photo 3: ID Card */}
              <div 
                onClick={() => photoRefs.id.current?.click()}
                className={`relative h-32 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all ${idPhoto ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-slate-50'}`}
              >
                 <input type="file" accept="image/*" capture="environment" ref={photoRefs.id} onChange={(e) => handlePhotoCapture(e, 'id')} className="hidden" />
                 {idPhoto ? <img src={idPhoto} className="w-full h-full object-cover grayscale" /> : (
                   <div className="text-center px-2">
                     <ShieldCheck size={18} className="text-slate-300 mx-auto mb-1" />
                     <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">{lang === 'zh' ? '证件照' : 'ID Picha'}</p>
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Basic Info Section */}
        <div className="space-y-4 bg-slate-50/50 p-6 rounded-[40px] border border-slate-100">
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '办公室编号 *' : 'ID ya Mashine *'}</label>
                <input type="text" value={machineId} onChange={e => setMachineId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-black text-slate-900 uppercase outline-none focus:border-indigo-500 transition-all" placeholder="OFFICE-001" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '初始读数' : 'Namba ya Mwanzo'}</label>
                <input type="number" value={initialScore} onChange={e => setInitialScore(e.target.value)} className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-black text-slate-900 outline-none" placeholder="0" />
              </div>
           </div>

           <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '商铺名称 *' : 'Jina la Duka *'}</label>
             <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <Building2 size={16} className="text-slate-400" />
                <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} className="w-full bg-transparent font-black text-slate-900 outline-none" placeholder="Shop/Store Name" />
             </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '老板姓名 *' : 'Jina la Tajiri *'}</label>
                <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-black text-slate-900" placeholder="Owner Name" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '老板电话 *' : 'Simu ya Tajiri *'}</label>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-2">
                   <Phone size={14} className="text-slate-400" />
                   <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} className="w-full bg-transparent font-black text-slate-900 text-sm outline-none" placeholder="06XXXXXXXX" />
                </div>
              </div>
           </div>
        </div>

        {/* Area & GPS Mandatory */}
        <div className="grid grid-cols-2 gap-4 items-end">
           <div className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{lang === 'zh' ? '所属区域 *' : 'Eneo *'}</label>
             <input type="text" value={area} onChange={e => setArea(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black text-slate-900" placeholder="Kariakoo" />
           </div>
           <button 
             onClick={fetchGps} 
             disabled={isGpsLoading}
             className={`h-[58px] rounded-2xl border flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${gps ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
           >
              {isGpsLoading ? <Loader2 size={18} className="animate-spin" /> : (gps ? <CheckCircle2 size={18} /> : <MapPinned size={18} />)}
              <span className="text-[10px] font-black uppercase">{gps ? 'GPS OK' : '强制定位 GET GPS'}</span>
           </button>
        </div>

        {/* Debt / Deposit */}
        <div className="bg-amber-50 p-5 rounded-[28px] border border-amber-100 focus-within:border-amber-300 transition-all">
           <label className="text-[9px] font-black text-amber-600 uppercase mb-2 flex items-center gap-1"><Coins size={12} /> {lang === 'zh' ? '初始铺货币 / 押金回收' : 'Mtaji wa Sarafu / Deni'}</label>
           <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-400">TZS</span>
              <input type="number" value={startupDebt} onChange={e => setStartupDebt(e.target.value)} className="w-full bg-transparent font-black text-lg text-amber-900 outline-none placeholder:text-amber-300/50" placeholder="0" />
           </div>
        </div>

        {/* Submit Button */}
        <button 
          onClick={handleSubmit} 
          disabled={isSubmitting}
          className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-sm shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
          {isSubmitting ? (lang === 'zh' ? '正在注册...' : 'Inasajili...') : (lang === 'zh' ? '完成注册' : 'Hifadhi Sasa')}
        </button>
      </div>
    </div>
  );
};

const PlusButtonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export default MachineRegistrationForm;

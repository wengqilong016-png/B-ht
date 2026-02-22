import React, { useState, useRef } from 'react';
import { Camera, RefreshCw, Send, Loader2, ImagePlus, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
import { Location, Driver, Transaction, AILog } from '../types';

interface ClearanceFormProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
  onCancel: () => void;
}

const ClearanceForm: React.FC<ClearanceFormProps> = ({ locations, currentDriver, onSubmit, lang, onLogAI, onCancel }) => {
  const [selectedLocId, setSelectedLocId] = useState('');
  const [beforeScore, setBeforeScore] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  
  const selectedLocation = locations.find(l => l.id === selectedLocId);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>, isAfter = false) => {
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
          if (isAfter) setAfterPhoto(base64);
          else setBeforePhoto(base64);
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (!selectedLocation || !beforePhoto || !afterPhoto || !beforeScore) return;
    setIsSubmitting(true);
    
    navigator.geolocation.getCurrentPosition(pos => {
        const tx: Transaction = {
            id: `CLR-${Date.now()}`,
            timestamp: new Date().toISOString(),
            locationId: selectedLocation.id,
            locationName: selectedLocation.name,
            driverId: currentDriver.id,
            driverName: currentDriver.name,
            previousScore: selectedLocation.lastScore,
            currentScore: 0,
            revenue: 0,
            commission: 0,
            ownerRetention: 0,
            debtDeduction: 0,
            startupDebtDeduction: 0,
            expenses: 0,
            coinExchange: 0,
            extraIncome: 0,
            netPayable: 0,
            gps: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            photoUrl: beforePhoto,
            clearancePhotoUrl: afterPhoto, 
            dataUsageKB: 50,
            isSynced: false,
            // @ts-ignore
            isClearance: true,
            notes: `High Score Clearance: ${beforeScore} -> 0`
        };
        
        onSubmit(tx);
        setIsSubmitting(false);
    }, err => {
        alert("GPS Required for Clearance");
        setIsSubmitting(false);
    });
  };

  return (
    <div className="max-w-md mx-auto pb-24 px-4 animate-in slide-in-from-bottom-8">
       <div className="bg-white rounded-[40px] p-8 shadow-2xl border border-slate-200">
          <div className="flex justify-between items-center mb-6">
             <button onClick={onCancel} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-indigo-600"><RotateCcw size={20}/></button>
             <h2 className="text-xl font-black text-slate-900 uppercase">机器清分申请 (CLEARANCE)</h2>
             <div className="w-10"></div>
          </div>

          {!selectedLocId ? (
            <div className="space-y-4">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">选择机器 (SELECT MACHINE)</label>
               {locations.map(loc => (
                 <button key={loc.id} onClick={() => setSelectedLocId(loc.id)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                    <span className="font-black text-slate-700">{loc.machineId} - {loc.name}</span>
                    <span className="text-xs font-bold text-slate-400">上次: {loc.lastScore}</span>
                 </button>
               ))}
            </div>
          ) : (
            <div className="space-y-6">
               <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">当前机器 (TARGET)</p>
                  <p className="text-xl font-black text-amber-900">{selectedLocation?.machineId}</p>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div onClick={() => fileInputRef.current?.click()} className={`h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${beforePhoto ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
                     <input type="file" ref={fileInputRef} onChange={e => handlePhotoCapture(e)} className="hidden" accept="image/*" capture="environment" />
                     {beforePhoto ? <img src={beforePhoto} className="w-full h-full object-cover rounded-2xl" /> : (
                        <>
                           <Camera className="text-slate-300 mb-2" />
                           <p className="text-[8px] font-black uppercase text-slate-400">清分前 (9000+)</p>
                        </>
                     )}
                  </div>
                  <div onClick={() => afterInputRef.current?.click()} className={`h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${afterPhoto ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300'}`}>
                     <input type="file" ref={afterInputRef} onChange={e => handlePhotoCapture(e, true)} className="hidden" accept="image/*" capture="environment" />
                     {afterPhoto ? <img src={afterPhoto} className="w-full h-full object-cover rounded-2xl" /> : (
                        <>
                           <RefreshCw className="text-slate-300 mb-2" />
                           <p className="text-[8px] font-black uppercase text-slate-400">清分后 (0000)</p>
                        </>
                     )}
                  </div>
               </div>

               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-2">清分前读数 (HIGH SCORE)</label>
                  <input type="number" value={beforeScore} onChange={e => setBeforeScore(e.target.value)} className="w-full text-2xl font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200" placeholder="9000" />
               </div>

               <button 
                 onClick={handleSubmit} 
                 disabled={!beforePhoto || !afterPhoto || !beforeScore || isSubmitting}
                 className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-sm shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {isSubmitting ? '正在提交...' : '确认清分并提交'}
               </button>
            </div>
          )}
       </div>
    </div>
  );
};

export default ClearanceForm;

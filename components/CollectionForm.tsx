
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Camera, Send, Loader2, BrainCircuit, X, Sparkles, Layers, Coins, ArrowRight, MapPin, Wand2, ShieldAlert, CheckCircle2, Wallet, AlertTriangle, ScanLine, Scan, Zap, Calculator, Search, HandCoins, Percent, Building2, ChevronRight, Trophy, Fuel, Wrench, Gavel, Banknote, User, Aperture } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, AILog } from '../types';

interface CollectionFormProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
}

const CollectionForm: React.FC<CollectionFormProps> = ({ locations, currentDriver, onSubmit, lang, onLogAI }) => {
  const t = TRANSLATIONS[lang];
  const [step, setStep] = useState<'selection' | 'entry'>('selection');
  const [selectedLocId, setSelectedLocId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [currentScore, setCurrentScore] = useState<string>('');
  
  // Expense States
  const [expenses, setExpenses] = useState<string>('');
  const [expenseType, setExpenseType] = useState<'public' | 'private'>('public');
  const [expenseCategory, setExpenseCategory] = useState<Transaction['expenseCategory']>('fuel');
  
  const [coinExchange, setCoinExchange] = useState<string>(''); 
  const [ownerRetention, setOwnerRetention] = useState<string>('');
  const [isOwnerRetaining, setIsOwnerRetaining] = useState(true);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  const selectedLocation = useMemo(() => locations.find(l => l.id === selectedLocId), [selectedLocId, locations]);

  useEffect(() => {
    if (selectedLocation && currentScore) {
      const score = parseInt(currentScore) || 0;
      const diff = Math.max(0, score - selectedLocation.lastScore);
      const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
      const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
      
      if (isOwnerRetaining) {
        const calculatedCommission = Math.floor(revenue * rate);
        setOwnerRetention(calculatedCommission.toString());
      } else {
        setOwnerRetention('0');
      }
    }
  }, [selectedLocation, currentScore, isOwnerRetaining]);

  const calculations = useMemo(() => {
    if (!selectedLocation) return { diff: 0, revenue: 0, commission: 0, netPayable: 0, remainingCoins: 0, isCoinStockNegative: false };
    
    const score = parseInt(currentScore) || 0;
    const diff = Math.max(0, score - selectedLocation.lastScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS; 
    const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
    const commission = Math.floor(revenue * rate); 
    
    const expenseVal = parseInt(expenses) || 0;
    const exchangeVal = parseInt(coinExchange) || 0;
    const retentionVal = parseInt(ownerRetention) || 0;

    // Logic: Expenses (whether public or private) are deducted from the cash handed over today
    const netPayable = revenue - retentionVal - expenseVal;
    const initialFloat = currentDriver?.dailyFloatingCoins || 0;
    const remainingCoins = initialFloat + revenue - retentionVal - expenseVal - exchangeVal;
    
    return { diff, revenue, commission, netPayable, remainingCoins, isCoinStockNegative: remainingCoins < 0 };
  }, [selectedLocation, currentScore, coinExchange, expenses, ownerRetention, currentDriver?.dailyFloatingCoins]);

  const filteredLocations = useMemo(() => {
    if (!searchQuery) return locations;
    const lower = searchQuery.toLowerCase();
    return locations.filter(l => 
      l.name.toLowerCase().includes(lower) || 
      l.machineId.toLowerCase().includes(lower) ||
      l.area.toLowerCase().includes(lower)
    );
  }, [locations, searchQuery]);

  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannerStatus('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanIntervalRef.current = window.setInterval(captureAndAnalyze, 1000); // Slower interval to prevent lag
      }
    } catch (err) {
      alert(lang === 'zh' ? "无法访问摄像头" : "Kamera imekataliwa");
      setIsScannerOpen(false);
    }
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    setIsScannerOpen(false);
    setScannerStatus('idle');
    isProcessingRef.current = false;
  };

  // Manual Photo Capture (Bypasses AI wait)
  const takeManualPhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      setPhotoData(base64);
      // Don't set score, let user enter it manually
      stopScanner();
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || scannerStatus === 'success' || isProcessingRef.current) return;
    if (videoRef.current.readyState !== 4) return;

    isProcessingRef.current = true;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        isProcessingRef.current = false;
        return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const minDim = Math.min(vw, vh);
    const cropSize = minDim * 0.55; 
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;
    const TARGET_SIZE = 400; 

    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, TARGET_SIZE, TARGET_SIZE);
    const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const modelName = 'gemini-3-flash-preview';
      const response = await ai.models.generateContent({
        model: modelName, 
        contents: [{
          parts: [
            { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
            { text: "Read the red 7-segment LED number. Return digits only." } 
          ]
        }],
        config: { maxOutputTokens: 10, temperature: 0.1 }
      });

      const result = response.text?.trim();
      const match = result?.match(/\d+/);
      
      if (match && !isNaN(Number(match[0]))) {
        const evidenceCanvas = document.createElement('canvas');
        evidenceCanvas.width = 640;
        evidenceCanvas.height = 640 * (vh / vw);
        const evidenceCtx = evidenceCanvas.getContext('2d');
        evidenceCtx?.drawImage(video, 0, 0, evidenceCanvas.width, evidenceCanvas.height);
        
        setCurrentScore(match[0]);
        const finalImage = evidenceCanvas.toDataURL('image/jpeg', 0.7);
        setPhotoData(finalImage); 
        setScannerStatus('success');
        
        // Log to AI Hub
        onLogAI({
          id: `LOG-${Date.now()}`,
          timestamp: new Date().toISOString(),
          driverId: currentDriver.id,
          driverName: currentDriver.name,
          query: `OCR Scan for ${selectedLocation?.name || 'Unknown'}`,
          response: `Detected Value: ${match[0]}`,
          imageUrl: finalImage,
          modelUsed: modelName,
          relatedLocationId: selectedLocation?.id
        });

        setTimeout(() => stopScanner(), 500);
      }
    } catch (e) {
      // Fail silently for loop
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (!selectedLocation || isUploading) return;
    if (calculations.isCoinStockNegative && !confirm(lang === 'zh' ? "⚠️ 库存不足，是否确认？" : "⚠️ Sarafu hazitoshi, endelea?")) return;

    setIsUploading(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const expenseValue = parseInt(expenses) || 0;
      
      const tx: Transaction = {
        id: `TX-${Date.now()}`, 
        timestamp: new Date().toISOString(), 
        locationId: selectedLocation.id, 
        locationName: selectedLocation.name,
        driverId: currentDriver.id, 
        previousScore: selectedLocation.lastScore, 
        currentScore: parseInt(currentScore) || selectedLocation.lastScore,
        revenue: calculations.revenue, 
        commission: calculations.commission, 
        ownerRetention: parseInt(ownerRetention) || 0,
        debtDeduction: 0, startupDebtDeduction: 0,
        
        // Expense Logic
        expenses: expenseValue, 
        expenseType: expenseValue > 0 ? expenseType : undefined,
        expenseCategory: expenseValue > 0 ? expenseCategory : undefined,
        expenseStatus: expenseValue > 0 ? 'pending' : undefined, // All expenses require approval
        
        coinExchange: parseInt(coinExchange) || 0, extraIncome: 0,
        netPayable: calculations.netPayable, 
        gps: { lat: pos.coords.latitude, lng: pos.coords.longitude }, 
        photoUrl: photoData || undefined, 
        dataUsageKB: 120, isSynced: false,
        paymentStatus: 'paid' // Assumes collection is handed over. Expense approval handled separately.
      };
      onSubmit(tx);
      setIsUploading(false);
      setStep('selection');
      setSearchQuery('');
      setCurrentScore('');
      setPhotoData(null);
      setOwnerRetention('');
      setExpenses('');
      setCoinExchange('');
      setIsOwnerRetaining(true);
      
      // Reset expense fields
      setExpenseType('public');
      setExpenseCategory('fuel');

      alert(lang === 'zh' ? '✅ 巡检报告已存档' : '✅ Ripoti imehifadhiwa');
    }, () => { 
        alert("GPS Denied"); 
        setIsUploading(false); 
    }, { timeout: 8000 });
  };

  if (step === 'selection') {
    return (
      <div className="max-w-md mx-auto py-8 px-4 animate-in fade-in">
        <div className="flex items-center justify-between mb-8 px-2">
           <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 uppercase">
            <ScanLine className="text-indigo-600" />
            {t.selectMachine}
          </h2>
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-2xl shadow-lg">
             <Coins size={14} className="text-emerald-400" />
             <span className="text-xs font-black text-white">{(currentDriver?.dailyFloatingCoins ?? 0).toLocaleString()}</span>
          </div>
        </div>

        <div className="relative mb-8 group">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder={t.enterId}
            className="w-full bg-white border border-slate-200 rounded-[32px] py-5 pl-14 pr-6 text-sm font-bold shadow-xl shadow-indigo-50/50 outline-none focus:border-indigo-500/10 focus:ring-4 transition-all"
          />
        </div>

        <div className="space-y-4">
          {filteredLocations.map(loc => (
            <button key={loc.id} onClick={() => { setSelectedLocId(loc.id); setStep('entry'); }} className="w-full bg-white p-6 rounded-[35px] border border-slate-200 flex justify-between items-center shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all group active:scale-[0.98]">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-slate-50 rounded-[20px] flex items-center justify-center text-slate-600 font-black text-[11px] border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner uppercase">
                  {loc.machineId}
                </div>
                <div className="text-left">
                  <span className="text-slate-900 block text-base font-black leading-tight">{loc.name}</span>
                  <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-400 font-black uppercase mt-1 tracking-widest">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{loc.area}</span>
                    <span className="text-indigo-500">L: {loc.lastScore}</span>
                    <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{(loc.commissionRate * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-24 px-4 animate-in slide-in-from-bottom-8">
      <div className="bg-white rounded-[48px] p-8 border border-slate-200 shadow-2xl space-y-8 relative overflow-hidden">
        
        <div className="flex justify-between items-center border-b border-slate-50 pb-6">
           <button onClick={() => setStep('selection')} className="p-3 bg-slate-100 rounded-full text-slate-500 hover:text-indigo-600 transition-colors"><ArrowRight size={20} className="rotate-180" /></button>
           <div className="text-center">
             <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedLocation?.name}</h2>
             <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-1">{selectedLocation?.machineId} • {(selectedLocation!.commissionRate * 100).toFixed(0)}%</p>
           </div>
           <div className="p-3 opacity-0"><ArrowRight size={20} /></div>
        </div>

        <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-200 relative group focus-within:border-indigo-400 transition-all shadow-inner">
             <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest text-center">{t.currentReading}</label>
             <div className="flex items-center justify-between gap-4">
                <input 
                  type="number" 
                  value={currentScore} 
                  onChange={e => setCurrentScore(e.target.value)} 
                  className="w-1/2 text-4xl font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200" 
                  placeholder="0000" 
                />
                <button 
                  onClick={startScanner}
                  className={`flex-1 py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${currentScore ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}
                >
                  {currentScore ? <CheckCircle2 size={18} /> : <Scan size={18} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">{currentScore ? '重新扫描' : t.scanner}</span>
                </button>
             </div>
             {photoData && !isScannerOpen && (
               <div className="mt-5 h-28 w-full rounded-2xl overflow-hidden border-2 border-white shadow-md relative group">
                 <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt="Proof" />
                 <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                   Evidence Captured
                 </div>
               </div>
             )}
        </div>

        {currentScore && (
          <div className={`p-6 rounded-[35px] shadow-2xl text-white space-y-4 animate-in slide-in-from-top-4 transition-colors ${calculations.revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-900'}`}>
             <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg"><Calculator size={14} className="text-white" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{t.formula}</span>
               </div>
               {calculations.revenue > 50000 && (
                 <div className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-md text-[9px] font-black uppercase flex items-center gap-1 animate-pulse">
                    <Trophy size={10} /> High Value
                 </div>
               )}
             </div>
             <div className="flex justify-between items-center text-[10px] font-black opacity-50 uppercase border-b border-white/10 pb-2">
               <span>({currentScore} - {selectedLocation?.lastScore})</span>
               <span>{t.diff} {calculations.diff}</span>
             </div>
             <div className="flex justify-between items-center pt-1">
               <span className="text-sm font-black opacity-80">{calculations.diff} × 200 TZS</span>
               <div className="text-right">
                  <p className="text-2xl font-black text-white">TZS {calculations.revenue.toLocaleString()}</p>
                  <p className="text-[8px] font-bold opacity-60 uppercase">Jumla ya Mapato</p>
               </div>
             </div>
          </div>
        )}
          
        <div className="grid grid-cols-1 gap-4">
            {/* Retention Toggle */}
            <div className={`p-6 rounded-[35px] border transition-all duration-300 ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex justify-between items-center mb-4">
                <label className={`text-[10px] font-black uppercase flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-slate-400'}`}>
                  <HandCoins size={14} /> {t.retention}
                </label>
                <button 
                  type="button"
                  onClick={() => setIsOwnerRetaining(!isOwnerRetaining)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isOwnerRetaining ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>
              
              {isOwnerRetaining ? (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-black text-amber-300">TZS</span>
                    <input type="number" value={ownerRetention} onChange={e => setOwnerRetention(e.target.value)} className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200" placeholder="0" />
                  </div>
                  <p className="text-[8px] font-black text-amber-400 uppercase tracking-tighter">{(selectedLocation!.commissionRate * 100).toFixed(0)}% Pesa imeachwa dukani</p>
                </div>
              ) : (
                <div className="p-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 animate-in zoom-in-95">
                  <ShieldAlert size={20} />
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase">全额收回 (FULL COLLECT)</p>
                    <p className="text-[8px] font-bold opacity-80 mt-0.5">Deni TZS {calculations.commission.toLocaleString()} litawekwa.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Enhanced Expense Section */}
            <div className="bg-rose-50 p-6 rounded-[35px] border border-rose-100 relative">
               <div className="flex items-center justify-between mb-4">
                 <label className="text-[10px] font-black text-rose-500 uppercase flex items-center gap-2">
                   <Banknote size={14} /> {lang === 'zh' ? '支出 / 预支申报' : 'Matumizi / Deni'}
                 </label>
                 {parseInt(expenses) > 0 && (
                   <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded text-[9px] font-black uppercase animate-pulse">待审批 Pending</span>
                 )}
               </div>

               <div className="flex bg-white/50 p-1 rounded-xl mb-3">
                 <button 
                   onClick={() => setExpenseType('public')} 
                   className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${expenseType === 'public' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-100'}`}
                 >
                   公款报销 (Company)
                 </button>
                 <button 
                   onClick={() => setExpenseType('private')} 
                   className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${expenseType === 'private' ? 'bg-indigo-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-100'}`}
                 >
                   个人预支 (Loan)
                 </button>
               </div>

               <div className="flex items-center gap-2 mb-3">
                  <select 
                    value={expenseCategory} 
                    onChange={e => setExpenseCategory(e.target.value as any)} 
                    className="bg-white border border-rose-100 rounded-xl px-2 py-2 text-[10px] font-black text-rose-600 outline-none uppercase"
                  >
                    {expenseType === 'public' ? (
                      <>
                        <option value="fuel">加油 (Fuel)</option>
                        <option value="repair">维修 (Repair)</option>
                        <option value="fine">罚款 (Fine)</option>
                        <option value="other">其他 (Other)</option>
                      </>
                    ) : (
                      <>
                        <option value="allowance">饭补 (Allowance)</option>
                        <option value="salary_advance">预支工资 (Salary)</option>
                        <option value="other">借款 (Loan)</option>
                      </>
                    )}
                  </select>
                  <div className="flex-1 flex items-baseline gap-1 border-b border-rose-200 px-1">
                     <span className="text-xs font-black text-rose-300">TZS</span>
                     <input 
                       type="number" 
                       value={expenses} 
                       onChange={e => setExpenses(e.target.value)} 
                       className="w-full text-xl font-black bg-transparent outline-none text-rose-900 placeholder:text-rose-200" 
                       placeholder="0" 
                     />
                  </div>
               </div>
               
               <p className="text-[9px] font-bold text-rose-400 opacity-80">
                 {expenseType === 'public' 
                   ? (lang === 'zh' ? '* 公司运营成本，不影响个人欠款' : '* Gharama ya kampuni') 
                   : (lang === 'zh' ? '* 计入个人借款，需在工资中抵扣' : '* Deni binafsi, litalipwa mshahara')}
               </p>
            </div>
        </div>

        <div className="bg-emerald-50 p-6 rounded-[35px] border border-emerald-100">
          <label className="text-[10px] font-black text-emerald-600 uppercase block mb-2 tracking-widest">{t.exchange} (Sarafu)</label>
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-emerald-500 rounded-xl text-white"><Coins size={20} /></div>
             <input type="number" value={coinExchange} onChange={e => setCoinExchange(e.target.value)} className="w-full text-2xl font-black bg-transparent outline-none text-emerald-900 placeholder:text-emerald-200" placeholder="0" />
          </div>
        </div>

        <div className="p-6 rounded-[35px] border-2 border-slate-100 bg-slate-50 flex justify-between items-center shadow-inner">
             <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.net}</span>
               <span className="text-[8px] font-bold text-slate-300 uppercase mt-1">Pesa ya Kukabidhi</span>
             </div>
             <span className="text-3xl font-black text-slate-900">TZS {calculations.netPayable.toLocaleString()}</span>
        </div>

        <button 
          onClick={handleSubmit} 
          disabled={isUploading || !currentScore || !photoData} 
          className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-sm shadow-2xl shadow-indigo-100 disabled:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-4"
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <Send size={22} />} 
          {isUploading ? t.loading : t.confirmSubmit}
        </button>
      </div>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in">
          <div className="relative flex-1">
            <video ref={videoRef} playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className={`w-80 h-80 border-2 rounded-[50px] relative transition-all duration-700 ${scannerStatus === 'success' ? 'border-emerald-500 scale-105 shadow-[0_0_80px_#10b981]' : 'border-white/20'}`}>
                {scannerStatus === 'scanning' && <div className="absolute top-0 left-6 right-6 h-1 bg-red-500 shadow-[0_0_20px_#ef4444] animate-scan-y rounded-full"></div>}
                
                <div className="absolute -top-2 -left-2 w-10 h-10 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl"></div>
                <div className="absolute -top-2 -right-2 w-10 h-10 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl"></div>
                <div className="absolute -bottom-2 -left-2 w-10 h-10 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl"></div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl"></div>

                {scannerStatus === 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
                    <BrainCircuit size={48} className="animate-pulse opacity-40" />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] animate-pulse text-red-400">Locking LED...</p>
                  </div>
                )}
                
                {scannerStatus === 'success' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 rounded-[50px] animate-in zoom-in-50">
                    <CheckCircle2 size={72} className="text-emerald-400 mb-2" />
                    <p className="text-4xl font-black text-white tracking-tighter">{currentScore}</p>
                    <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest mt-2">IDHINI</p>
                  </div>
                )}
              </div>
              
              <div className="mt-16 text-center text-white/40 px-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">{lang === 'zh' ? '请将摄像头对准机器红色计数屏' : 'Lenga kamera kwenye namba nyekundu'}</p>
              </div>
            </div>

            {/* Manual Photo Button - Crucial Fallback */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-auto">
               <button 
                 onClick={takeManualPhoto}
                 className="bg-white text-slate-900 px-6 py-4 rounded-2xl flex items-center gap-3 font-black uppercase text-xs shadow-2xl active:scale-95 transition-transform"
               >
                 <Aperture size={20} className="text-indigo-600" />
                 {lang === 'zh' ? '仅拍照 (手动填数)' : 'Piga Picha Tu (Jaza Namba)'}
               </button>
            </div>

            <button onClick={stopScanner} className="absolute top-12 right-8 p-4 bg-white/10 backdrop-blur-3xl rounded-full text-white pointer-events-auto active:scale-90 transition-transform">
              <X size={28} />
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes scan {
          0% { top: 15%; opacity: 0.2; }
          50% { top: 85%; opacity: 1; }
          100% { top: 15%; opacity: 0.2; }
        }
        .animate-scan-y {
          animation: scan 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default CollectionForm;

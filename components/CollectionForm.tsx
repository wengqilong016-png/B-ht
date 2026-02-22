import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Camera, Send, Loader2, BrainCircuit, X, Sparkles, Layers, Coins, ArrowRight, MapPin, Wand2, ShieldAlert, CheckCircle2, Wallet, AlertTriangle, ScanLine, Scan, Zap, Calculator, Search, HandCoins, Percent, Building2, ChevronRight, Trophy, Fuel, Wrench, Gavel, Banknote, User, Aperture, Edit2, RotateCcw, Plus, Satellite } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, AILog } from '../types';
import MachineRegistrationForm from './MachineRegistrationForm';
import { validateDataQuality } from '../src/dataQualityGuard';

interface CollectionFormProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
  onRegisterMachine?: (location: Location) => void;
}

interface AIReviewData {
  score: string;
  condition: string; // 'Normal', 'Damaged', 'Unclear'
  notes: string;
  image: string;
}

type SubmissionStatus = 'idle' | 'gps' | 'uploading';

const CollectionForm: React.FC<CollectionFormProps> = ({ locations, currentDriver, onSubmit, lang, onLogAI, onRegisterMachine }) => {
  const t = TRANSLATIONS[lang];
  const [step, setStep] = useState<'selection' | 'entry'>('selection');
  const [selectedLocId, setSelectedLocId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Registration View State
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Draft Transaction ID for linking AI logs before submission
  const [draftTxId, setDraftTxId] = useState<string>('');

  const [currentScore, setCurrentScore] = useState<string>('');
  
  // Deduction States (The 'Question Mark')
  const [tips, setTips] = useState<string>('');
  const [driverLoan, setDriverLoan] = useState<string>('');
  const [isMerchantDeposit, setIsMerchantDeposit] = useState(false);
  
  // Expense States
  const [expenses, setExpenses] = useState<string>('');
  const [expenseType, setExpenseType] = useState<'public' | 'private'>('public');
  const [expenseCategory, setExpenseCategory] = useState<Transaction['expenseCategory']>('fuel');
  
  const [coinExchange, setCoinExchange] = useState<string>(''); 
  const [ownerRetention, setOwnerRetention] = useState<string>('');
  const [isOwnerRetaining, setIsOwnerRetaining] = useState(true);
  const [photoData, setPhotoData] = useState<string | null>(null);
  
  // New Status State
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [showGpsSkip, setShowGpsSkip] = useState(false);
  
  // Scanner & AI Review States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'review'>('idle');
  const [aiReviewData, setAiReviewData] = useState<AIReviewData | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const gpsTimeoutRef = useRef<any>(null); // Fixed: Changed NodeJS.Timeout to any for browser compatibility

  const selectedLocation = useMemo(() => locations.find(l => l.id === selectedLocId), [selectedLocId, locations]);

  const handleSelectLocation = (locId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (loc && (loc.area === 'TO BE SET' || loc.ownerName === 'PENDING')) {
      if (confirm(lang === 'zh' ? '检测到这是预设点位，请先完善实地入网资料（合影与定位）。' : 'Hii ni mashine mpya iliyopangwa. Tafadhali kamilisha usajili wa eneo kwanza.')) {
        // Prepare data for MachineRegistrationForm
        // We will pass the existing ID and MachineID to avoid duplicates
        setIsRegistering(true);
        return;
      }
    }
    setSelectedLocId(locId);
    setDraftTxId(`TX-${Date.now()}`); 
    setStep('entry');
  };

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
    const tipVal = parseInt(tips) || 0;
    const loanVal = parseInt(driverLoan) || 0;
    
    // 灵活逻辑：商家给司机的纸币（用于换走机器里的硬币）
    // 默认建议：如果全额换币，这里就是 revenue
    const exchangeVal = parseInt(coinExchange) || 0; 
    
    // 灵活逻辑：司机现场给商家的钱（可能是纸币分红，也可能是其他）
    const retentionVal = parseInt(ownerRetention) || 0;

    // 最终上缴现金 = (换币拿到的现金) - (现场给商家的分红/支出) - (小费/借款/报销)
    const netPayable = exchangeVal - retentionVal - tipVal - loanVal - expenseVal;
    
    const initialFloat = currentDriver?.dailyFloatingCoins || 0;
    
    // 硬币变化 = (机器产出的硬币) - (被商家用现金换走的硬币)
    // 注意：如果商家分红也拿的是硬币，这部分逻辑由 retentionVal 控制（假设分红是纸币，换币是硬币）
    const coinsExchangedCount = Math.floor(exchangeVal / CONSTANTS.COIN_VALUE_TZS);
    const remainingCoins = initialFloat + diff - coinsExchangedCount;
    
    return { diff, revenue, commission, netPayable, remainingCoins, isCoinStockNegative: remainingCoins < 0 };
  }, [selectedLocation, currentScore, tips, driverLoan, expenses, ownerRetention, coinExchange, currentDriver?.dailyFloatingCoins]);

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
    setAiReviewData(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanIntervalRef.current = window.setInterval(captureAndAnalyze, 1500); // 1.5s interval
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
    setAiReviewData(null);
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
      
      // Go to manual review directly with clear defaults
      setAiReviewData({
        score: '',
        condition: 'Normal',
        notes: '',
        image: base64
      });
      setScannerStatus('review');
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    }
  };

  const captureAndAnalyze = async () => {
    // Stop if we are reviewing or already processing
    if (!videoRef.current || !canvasRef.current || scannerStatus !== 'scanning' || isProcessingRef.current) return;
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
    const TARGET_SIZE = 512; 

    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, TARGET_SIZE, TARGET_SIZE);
    const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const modelName = 'gemini-3-flash-preview';
      
      // Structured Prompt for JSON
      const prompt = `
        Analyze this vending machine counter image.
        1. Read the red 7-segment LED number.
        2. Check for screen damage (cracks, black spots) or physical tampering.
        
        Return JSON format:
        {
          "score": "12345", 
          "condition": "Normal" | "Damaged" | "Unclear",
          "notes": "Short observation"
        }
      `;

      const response = await ai.models.generateContent({
        model: modelName, 
        contents: [{
          parts: [
            { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
            { text: prompt } 
          ]
        }],
        config: { 
            responseMimeType: 'application/json',
            temperature: 0.1 
        }
      });

      const resultText = response.text?.trim();
      if (!resultText) throw new Error("Empty AI response");

      const result = JSON.parse(resultText);
      const detectedScore = result.score?.replace(/\D/g, ''); // Ensure pure digits

      if (detectedScore && detectedScore.length >= 1) {
        const evidenceCanvas = document.createElement('canvas');
        evidenceCanvas.width = 640;
        evidenceCanvas.height = 640 * (vh / vw);
        const evidenceCtx = evidenceCanvas.getContext('2d');
        evidenceCtx?.drawImage(video, 0, 0, evidenceCanvas.width, evidenceCanvas.height);
        const finalImage = evidenceCanvas.toDataURL('image/jpeg', 0.7);

        // Transition to Review State
        setAiReviewData({
            score: detectedScore,
            condition: result.condition || 'Normal',
            notes: result.notes || '',
            image: finalImage
        });
        setScannerStatus('review');
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

        // Log to AI Hub silently
        onLogAI({
          id: `LOG-${Date.now()}`,
          timestamp: new Date().toISOString(),
          driverId: currentDriver.id,
          driverName: currentDriver.name,
          query: `AI Audit: ${selectedLocation?.name}`,
          response: `Read: ${detectedScore}, Condition: ${result.condition}`,
          imageUrl: finalImage,
          modelUsed: modelName,
          relatedLocationId: selectedLocation?.id,
          relatedTransactionId: draftTxId // Link the log to the pending transaction
        });
      }
    } catch (e) {
      // Fail silently loop
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleConfirmAI = () => {
     if (aiReviewData) {
         setCurrentScore(aiReviewData.score);
         setPhotoData(aiReviewData.image);
         stopScanner();
     }
  };

  const handleRetake = () => {
      setAiReviewData(null);
      setScannerStatus('scanning');
      // Restart interval
      scanIntervalRef.current = window.setInterval(captureAndAnalyze, 1500);
      isProcessingRef.current = false;
  };

  const processSubmission = (gpsCoords: {lat: number, lng: number}) => {
      setStatus('uploading');
      
      const expenseValue = parseInt(expenses) || 0;
      const tipValue = parseInt(tips) || 0;
      const loanValue = parseInt(driverLoan) || 0;
      
      const tx: Transaction = {
        id: draftTxId || `TX-${Date.now()}`, // Use the pre-generated ID
        timestamp: new Date().toISOString(), 
        locationId: selectedLocation!.id, 
        locationName: selectedLocation!.name,
        driverId: currentDriver.id, 
        driverName: currentDriver.name,
        previousScore: selectedLocation!.lastScore, 
        currentScore: parseInt(currentScore) || selectedLocation!.lastScore,
        aiScore: aiReviewData ? parseInt(aiReviewData.score) : undefined,
        aiConfidence: aiReviewData ? 0.95 : undefined, // Placeholder for AI confidence
        revenue: calculations.revenue, 
        commission: calculations.commission, 
        ownerRetention: parseInt(ownerRetention) || 0,
        isMerchantDeposit: isMerchantDeposit,
        tips: tipValue,
        driverLoan: loanValue,
        debtDeduction: 0, startupDebtDeduction: 0,
        
        // Expense Logic
        expenses: expenseValue, 
        expenseType: expenseValue > 0 ? expenseType : undefined,
        expenseCategory: expenseValue > 0 ? expenseCategory : undefined,
        expenseStatus: expenseValue > 0 ? 'pending' : undefined, // All expenses require approval
        
        coinExchange: parseInt(coinExchange) || 0, extraIncome: 0,
        netPayable: calculations.netPayable, 
        gps: gpsCoords, 
        photoUrl: photoData || undefined, 
        dataUsageKB: 120, isSynced: false,
        paymentStatus: 'paid', // Assumes collection is handed over. Expense approval handled separately.
        
        // Add condition and notes from AI Review if available
        reportedStatus: (aiReviewData?.condition === 'Damaged' ? 'broken' : 'active') as any,
        notes: aiReviewData?.notes
      };
      
      onSubmit(tx);
      
      // Cleanup
      setStatus('idle');
      setShowGpsSkip(false);
      setStep('selection');
      setSearchQuery('');
      setDraftTxId('');
      setCurrentScore('');
      setPhotoData(null);
      setOwnerRetention('');
      setExpenses('');
      setTips('');
      setDriverLoan('');
      setIsMerchantDeposit(false);
      setCoinExchange('');
      setIsOwnerRetaining(true);
      setAiReviewData(null);
      setExpenseType('public');
      setExpenseCategory('fuel');

      alert(lang === 'zh' ? '✅ 巡检报告已存档' : '✅ Ripoti imehifadhiwa');
  };

  const handleSubmit = async () => {
    if (!selectedLocation || status !== 'idle') return;

    // DATA-CENTRIC AI QUALITY GUARD
    const qualityResult = validateDataQuality({
      previousScore: selectedLocation.lastScore,
      currentScore: parseInt(currentScore) || 0,
      gpsDeviation: 0, // Calculated later during GPS acquisition
      revenue: calculations.revenue
    });

    if (!qualityResult.isValid) {
      const warningMsg = lang === 'zh' 
        ? `⚠️ 数据质量异常 (质量分: ${qualityResult.qualityScore}):\n- ${qualityResult.issues.join('\n- ')}\n\n是否确认数据无误并强制提交？`
        : `⚠️ Data Quality Issues (Score: ${qualityResult.qualityScore}):\n- ${qualityResult.issues.join('\n- ')}\n\nAre you sure you want to force submit?`;
      
      if (!confirm(warningMsg)) return;
    }

    if (calculations.isCoinStockNegative && !confirm(lang === 'zh' ? "⚠️ 库存不足，是否确认？" : "⚠️ Sarafu hazitoshi, endelea?")) return;

    setStatus('gps');
    setShowGpsSkip(false);

    // Set a timer to show Skip button if GPS takes too long
    gpsTimeoutRef.current = setTimeout(() => {
        setShowGpsSkip(true);
    }, 3000); // 3 seconds timeout for UX

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        processSubmission({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, 
      (err) => { 
        console.warn("GPS Error", err);
        // Don't auto fail, let user click Skip or it will timeout to allow skipping
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setShowGpsSkip(true); // Immediate skip option on error
      }, 
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleSkipGps = () => {
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
      if (confirm(lang === 'zh' ? "确认跳过 GPS 定位？(记录将标记为 GPS 缺失)" : "Ruka GPS?")) {
          processSubmission({ lat: 0, lng: 0 });
      }
  };

  if (isRegistering && onRegisterMachine) {
    return (
      <MachineRegistrationForm 
        onSubmit={(loc) => { onRegisterMachine(loc); setIsRegistering(false); }} 
        onCancel={() => setIsRegistering(false)} 
        currentDriver={currentDriver} 
        lang={lang} 
      />
    );
  }

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

        <div className="relative mb-6 group">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder={t.enterId}
            className="w-full bg-white border border-slate-200 rounded-[32px] py-5 pl-14 pr-6 text-sm font-bold shadow-xl shadow-indigo-50/50 outline-none focus:border-indigo-500/10 focus:ring-4 transition-all"
          />
        </div>

        {/* Merge New Machine Registration Entry */}
        {onRegisterMachine && (
          <button 
            onClick={() => setIsRegistering(true)} 
            className="w-full mb-6 py-4 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-[28px] font-black uppercase text-xs hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            {lang === 'zh' ? '新机入网注册 (NEW MACHINE)' : 'Sajili Mashine Mpya'}
          </button>
        )}

        <div className="space-y-4">
          {filteredLocations.map(loc => (
            <button key={loc.id} onClick={() => handleSelectLocation(loc.id)} className="w-full bg-white p-6 rounded-[35px] border border-slate-200 flex justify-between items-center shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all group active:scale-[0.98]">
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
                  className={`flex-1 py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${currentScore ? 'bg-emerald-50 text-white' : 'bg-slate-900 text-white'}`}
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
             {/* Revenue Header ... */}
             <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg"><Calculator size={14} className="text-white" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">营收详情 (REVENUE)</span>
               </div>
               {calculations.revenue > 50000 && (
                 <div className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-md text-[9px] font-black uppercase flex items-center gap-1 animate-pulse">
                    <Trophy size={10} /> High Value
                 </div>
               )}
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 p-4 rounded-2xl border border-white/5">
                   <p className="text-[8px] font-black text-white/50 uppercase mb-1">机器产出硬币 (TOTAL COINS)</p>
                   <p className="text-xl font-black">{calculations.diff} <span className="text-[10px] font-medium opacity-60">Pcs</span></p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/5">
                   <p className="text-[8px] font-black text-white/50 uppercase mb-1">总价值 (TOTAL VALUE)</p>
                   <p className="text-xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
                </div>
             </div>
          </div>
        )}

        {/* 灵活换币系统 (Flexible Asset Swap) */}
        <div className="bg-white rounded-[35px] border-2 border-indigo-100 p-6 shadow-sm space-y-5">
           <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-indigo-600 rounded-lg text-white"><RotateCcw size={14} /></div>
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">资产兑换 (ASSET SWAP)</span>
           </div>

           <div className="space-y-4">
              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-black text-indigo-600 uppercase">换出硬币，拿回现金 (COIN TO CASH)</label>
                  <button onClick={() => setCoinExchange(calculations.revenue.toString())} className="text-[8px] font-black bg-indigo-600 text-white px-2 py-1 rounded">全额兑换</button>
                </div>
                <div className="flex items-baseline gap-1">
                   <span className="text-xs font-black text-indigo-300">TZS</span>
                   <input 
                     type="number" 
                     value={coinExchange} 
                     onChange={e => setCoinExchange(e.target.value)} 
                     className="w-full text-2xl font-black bg-transparent outline-none text-indigo-900" 
                     placeholder="0" 
                   />
                </div>
                <p className="text-[8px] font-bold text-indigo-400 uppercase mt-1">司机增加现金，减少 {Math.floor((parseInt(coinExchange)||0)/200)} 个硬币</p>
              </div>
           </div>
        </div>
          
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

            {/* NEW: The "Question Mark" Deductions - Tips and Loans */}
            <div className="bg-slate-900 p-6 rounded-[35px] border border-slate-800 shadow-xl space-y-4">
               <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-amber-500 rounded-lg text-slate-900"><Gavel size={14} /></div>
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">其他扣款 (DEDUCTIONS)</span>
               </div>
               
               <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-[8px] font-black text-slate-400 uppercase block mb-2">{t.driverLoan}</label>
                    <div className="flex items-baseline gap-1">
                       <span className="text-[10px] font-black text-amber-500">TZS</span>
                       <input 
                         type="number" 
                         value={driverLoan} 
                         onChange={e => setDriverLoan(e.target.value)} 
                         className="w-full text-lg font-black bg-transparent outline-none text-white placeholder:text-white/10" 
                         placeholder="0" 
                       />
                    </div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-[8px] font-black text-slate-400 uppercase block mb-2">客户小费 (TIPS)</label>
                    <div className="flex items-baseline gap-1">
                       <span className="text-[10px] font-black text-emerald-500">TZS</span>
                       <input 
                         type="number" 
                         value={tips} 
                         onChange={e => setTips(e.target.value)} 
                         className="w-full text-lg font-black bg-transparent outline-none text-white placeholder:text-white/10" 
                         placeholder="0" 
                       />
                    </div>
                  </div>
               </div>
               <p className="text-[8px] font-bold text-slate-500 uppercase text-center italic">* 这些金额将直接从今日上缴现金中扣除</p>
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
                   {lang === 'zh' ? '公款报销 (Company)' : 'Matumizi ya Kampuni'}
                 </button>
                 <button 
                   onClick={() => setExpenseType('private')} 
                   className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${expenseType === 'private' ? 'bg-indigo-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-100'}`}
                 >
                   {lang === 'zh' ? '个人预支 (Loan)' : 'Mkopo Binafsi'}
                 </button>
               </div>

               <div className="flex items-center gap-2 mb-3">
                  <select 
                    value={expenseCategory} 
                    onChange={e => setExpenseCategory(e.target.value as any)} 
                    className="bg-white border border-rose-100 rounded-xl px-2 py-2 text-[10px] font-black text-rose-600 outline-none uppercase w-28"
                  >
                    {expenseType === 'public' ? (
                      <>
                        <option value="fuel">{lang === 'zh' ? '加油 (Fuel)' : 'Mafuta (Fuel)'}</option>
                        <option value="repair">{lang === 'zh' ? '维修 (Repair)' : 'Matengenezo (Repair)'}</option>
                        <option value="fine">{lang === 'zh' ? '罚款 (Fine)' : 'Faini (Fine)'}</option>
                        <option value="other">{lang === 'zh' ? '其他 (Other)' : 'Mengine (Other)'}</option>
                      </>
                    ) : (
                      <>
                        <option value="allowance">{lang === 'zh' ? '饭补 (Allowance)' : 'Chakula (Allowance)'}</option>
                        <option value="salary_advance">{lang === 'zh' ? '预支工资 (Salary)' : 'Mshahara (Advance)'}</option>
                        <option value="other">{lang === 'zh' ? '借款 (Loan)' : 'Mkopo (Loan)'}</option>
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
                   ? (lang === 'zh' ? '* 公司运营成本，不影响个人欠款' : '* Gharama ya kampuni, hailipwi na dereva') 
                   : (lang === 'zh' ? '* 计入个人借款，需在工资中抵扣' : '* Deni binafsi, litalipwa kwenye mshahara')}
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

        <div className="space-y-2">
          <button 
            onClick={handleSubmit} 
            disabled={status !== 'idle' || !currentScore || !photoData} 
            className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-sm shadow-2xl shadow-indigo-100 disabled:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-4"
          >
            {status !== 'idle' ? <Loader2 className="animate-spin" /> : <Send size={22} />} 
            {status === 'gps' ? 'Acquiring GPS...' : status === 'uploading' ? 'Saving...' : t.confirmSubmit}
          </button>
          
          {showGpsSkip && status === 'gps' && (
             <button 
               onClick={handleSkipGps}
               className="w-full py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl font-bold uppercase text-[10px] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-colors flex items-center justify-center gap-2 animate-in slide-in-from-top-1"
             >
                <Satellite size={14} /> GPS Slow? Skip & Submit
             </button>
          )}
        </div>
      </div>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in">
          <div className="relative flex-1">
            <video ref={videoRef} playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {/* Review UI Layer */}
              {scannerStatus === 'review' && aiReviewData ? (
                <div className="bg-white/90 backdrop-blur-xl w-[90%] max-w-sm rounded-[40px] p-6 shadow-2xl pointer-events-auto animate-in slide-in-from-bottom-10 duration-500 max-h-[85vh] overflow-y-auto">
                   <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                         <BrainCircuit size={24} />
                      </div>
                      <div>
                         <h3 className="text-lg font-black text-slate-900 uppercase">AI 识别结果确认</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase">Review & Confirm</p>
                      </div>
                   </div>

                   <div className="space-y-4 mb-6">
                      <div className="h-40 rounded-2xl overflow-hidden border-2 border-slate-100 relative group bg-black">
                         <img src={aiReviewData.image} className="w-full h-full object-contain" alt="Captured" />
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                         <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">机器读数 (Counter Score)</label>
                         <div className="flex items-center gap-3">
                            <input 
                              type="number" 
                              value={aiReviewData.score} 
                              onChange={e => setAiReviewData({...aiReviewData, score: e.target.value})} 
                              className="text-3xl font-black text-slate-900 bg-transparent w-full outline-none border-b border-dashed border-slate-300 focus:border-indigo-500 placeholder:text-slate-200"
                              placeholder="0000"
                            />
                            <Edit2 size={16} className="text-slate-400" />
                         </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase block ml-1">运行状态 (Condition)</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setAiReviewData({...aiReviewData, condition: 'Normal'})}
                                className={`flex-1 py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${aiReviewData.condition === 'Normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                            >
                                <CheckCircle2 size={18} />
                                <span className="text-[10px] font-black uppercase">正常 Normal</span>
                            </button>
                            <button 
                                onClick={() => setAiReviewData({...aiReviewData, condition: 'Damaged'})}
                                className={`flex-1 py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${aiReviewData.condition === 'Damaged' ? 'bg-rose-50 border-rose-200 text-rose-600 ring-2 ring-rose-500/20' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                            >
                                <AlertTriangle size={18} />
                                <span className="text-[10px] font-black uppercase">异常 Issue</span>
                            </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                         <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">备注 (Notes)</label>
                         <textarea 
                           value={aiReviewData.notes}
                           onChange={e => setAiReviewData({...aiReviewData, notes: e.target.value})}
                           className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none resize-none h-16"
                           placeholder="输入机器状况描述..."
                         />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                      <button onClick={handleRetake} className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                         <RotateCcw size={14} /> 重拍 Retake
                      </button>
                      <button onClick={handleConfirmAI} className="py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2">
                         <CheckCircle2 size={14} /> 确认并填入
                      </button>
                   </div>
                </div>
              ) : (
                // Scanning UI Layer
                <div className={`w-80 h-80 border-2 rounded-[50px] relative transition-all duration-700 ${scannerStatus === 'scanning' ? 'border-white/20' : 'border-emerald-500 scale-105'}`}>
                   {scannerStatus === 'scanning' && <div className="absolute top-0 left-6 right-6 h-1 bg-red-500 shadow-[0_0_20px_#ef4444] animate-scan-y rounded-full"></div>}
                   
                   <div className="absolute -top-2 -left-2 w-10 h-10 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl"></div>
                   <div className="absolute -top-2 -right-2 w-10 h-10 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl"></div>
                   <div className="absolute -bottom-2 -left-2 w-10 h-10 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl"></div>
                   <div className="absolute -bottom-2 -right-2 w-10 h-10 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl"></div>
                </div>
              )}
            </div>
            
             <div className="absolute bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
                 <div className="flex items-center gap-6 pointer-events-auto">
                    <button onClick={stopScanner} className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all">
                       <X size={24} />
                    </button>
                    {scannerStatus === 'scanning' && (
                        <button onClick={takeManualPhoto} className="w-20 h-20 bg-white rounded-full border-4 border-slate-200 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
                           <div className="w-16 h-16 rounded-full border-2 border-slate-900"></div>
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

export default CollectionForm;
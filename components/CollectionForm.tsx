import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Send, Loader2, BrainCircuit, X, Layers, Coins, ArrowRight, ShieldAlert, CheckCircle2, AlertTriangle, ScanLine, Scan, Calculator, Search, HandCoins, ChevronRight, Trophy, Fuel, Banknote, Edit2, RotateCcw, Plus, Satellite, Lock, RefreshCw, Wallet, Camera, WifiOff, DatabaseBackup, Route } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import EXIF from 'exif-js';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, AILog, safeRandomUUID, getDistance } from '../types';
import { compressAndResizeImage } from '../utils/imageUtils';
import MachineRegistrationForm from './MachineRegistrationForm';
import OfflineRouteMap from './OfflineRouteMap';
import { enqueueTransaction, extractGpsFromExif, estimateLocationFromContext, getPendingTransactions } from '../offlineQueue';

interface CollectionFormProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
  onRegisterMachine?: (location: Location) => void;
  isOnline?: boolean;
  allTransactions?: Transaction[];   // for route map
}

interface AIReviewData {
  score: string;
  condition: string; // 'Normal', 'Damaged', 'Unclear'
  notes: string;
  image: string;
}

type SubmissionStatus = 'idle' | 'gps' | 'uploading';
// Route prioritization keeps the selection list practical in the field:
// nearby means within ~1.5km, distance penalty stops growing after 9km,
// and GPS-less machines fall back to a very large distance so they sort later.
const NEARBY_DISTANCE_METERS = 1500;
const PRIORITY_DISTANCE_FALLBACK = 99999;
const PRIORITY_DISTANCE_CAP_KM = 9;
const PRIORITY_PENDING_WEIGHT = 100;
const PRIORITY_URGENT_WEIGHT = 50;
const PRIORITY_LOCKED_PENALTY = -200;
const PRIORITY_NEARBY_WEIGHT = 20;
const PRIORITY_ACTIVE_WEIGHT = 10;

const CollectionForm: React.FC<CollectionFormProps> = ({ locations, currentDriver, onSubmit, lang, onLogAI, onRegisterMachine, isOnline = true, allTransactions = [] }) => {
  const t = TRANSLATIONS[lang];
  // 4-step wizard: selection → capture → amounts → confirm
  const [step, setStep] = useState<'selection' | 'capture' | 'amounts' | 'confirm'>('selection');
  const [selectedLocId, setSelectedLocId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'pending' | 'urgent' | 'nearby'>('all');
  
  // Registration View State
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Draft Transaction ID for linking AI logs before submission
  const [draftTxId, setDraftTxId] = useState<string>('');

  const [currentScore, setCurrentScore] = useState<string>('');
  
  // Expense States
  const [expenses, setExpenses] = useState<string>('');
  const [expenseType, setExpenseType] = useState<'public' | 'private'>('public');
  const [expenseCategory, setExpenseCategory] = useState<Transaction['expenseCategory']>('fuel');
  
  const [coinExchange, setCoinExchange] = useState<string>(''); 
  const [ownerRetention, setOwnerRetention] = useState<string>('');
  const [isOwnerRetaining, setIsOwnerRetaining] = useState(true);
  const [photoData, setPhotoData] = useState<string | null>(null);
  
  // GPS Persistence & Permission States
  const [gpsCoords, setGpsCoords] = useState<{lat: number, lng: number} | null>(null);
  const [gpsPermission, setGpsPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  // New Status State
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [showGpsSkip, setShowGpsSkip] = useState(false);

  // Offline queue state
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [gpsSource, setGpsSource] = useState<'live' | 'exif' | 'estimated' | null>(null);
  
  // Scanner & AI Review States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'review'>('idle');
  const [aiReviewData, setAiReviewData] = useState<AIReviewData | null>(null);

  // Reset & Payout Request States
  const [resetRequestLocId, setResetRequestLocId] = useState<string | null>(null);
  const [resetPhotoData, setResetPhotoData] = useState<string | null>(null);
  const [payoutRequestLocId, setPayoutRequestLocId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const resetFileRef = useRef<HTMLInputElement>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const gpsTimeoutRef = useRef<any>(null);

  const requestGps = () => {
    if (!navigator.geolocation) return;
    
    setGpsPermission('prompt');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsPermission('granted');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsPermission('denied');
        }
        console.warn("GPS Request failed", err.message);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Request GPS as soon as capture step starts
  useEffect(() => {
    if (step === 'capture') {
      requestGps();
    }
  }, [step]);

  // Load offline queue count on mount and after each submission
  useEffect(() => {
    getPendingTransactions().then((list) => setOfflineQueueCount(list.length)).catch(() => {});
  }, [step]); // re-check when returning to selection screen

  const selectedLocation = useMemo(() => locations.find(l => l.id === selectedLocId), [selectedLocId, locations]);

  const handleSelectLocation = (locId: string) => {
    setSelectedLocId(locId);
    setDraftTxId(`TX-${Date.now()}`); // Generate ID immediately upon selection
    setStep('capture');
  };

  // Return to the selection screen, clearing form state
  const handleBackToSelection = () => {
    setStep('selection');
    setSelectedLocId('');
    setDraftTxId('');
    setCurrentScore('');
    setPhotoData(null);
    setAiReviewData(null);
    setOwnerRetention('');
    setExpenses('');
    setCoinExchange('');
    setIsOwnerRetaining(true);
    setExpenseType('public');
    setExpenseCategory('fuel');
    setGpsSource(null);
  };

  // 1. 核心计算逻辑：单一事实来源 (Single Source of Truth)
  const calculations = useMemo(() => {
    if (!selectedLocation) return { diff: 0, revenue: 0, commission: 0, netPayable: 0, remainingCoins: 0, isCoinStockNegative: false };
    
    // A. 基础收入计算
    const score = parseInt(currentScore) || 0;
    const diff = Math.max(0, score - selectedLocation.lastScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS; 
    
    // B. 佣金逻辑 (Commission vs Retention)
    const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
    const autoCommission = Math.floor(revenue * rate); 
    
    // C. 店主留存逻辑：如果开启开关且用户未手动修改，则等于自动计算的佣金
    let finalRetention = 0;
    if (isOwnerRetaining) {
      // 如果 ownerRetention 有值（且不等于0），说明用户可能手动修改过
      finalRetention = ownerRetention !== '' ? parseInt(ownerRetention) : autoCommission;
    }

    // D. 净支付额计算 (Net Payable)
    // 公式：总收入 - 留在店里的钱 - 今天的报销支出
    const expenseVal = parseInt(expenses) || 0;
    const netPayable = Math.max(0, revenue - finalRetention - expenseVal);

    // E. 硬币库存追踪 (Float Tracking)
    const exchangeVal = parseInt(coinExchange) || 0;
    const initialFloat = currentDriver?.dailyFloatingCoins || 0;
    // 逻辑：包里的硬币 = 初始 + 净收入 - 换出的币
    const remainingCoins = initialFloat + netPayable - exchangeVal;
    
    return { 
      diff, 
      revenue, 
      commission: autoCommission, 
      finalRetention,
      netPayable, 
      remainingCoins, 
      isCoinStockNegative: remainingCoins < 0 
    };
  }, [selectedLocation, currentScore, coinExchange, expenses, ownerRetention, isOwnerRetaining, currentDriver?.dailyFloatingCoins]);

  // 当选择新地点或读数改变时，根据开关状态初始化留存金额
  useEffect(() => {
    if (selectedLocation && currentScore && isOwnerRetaining && ownerRetention === '') {
      const score = parseInt(currentScore) || 0;
      const diff = Math.max(0, score - selectedLocation.lastScore);
      const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
      const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
      setOwnerRetention(Math.floor(revenue * rate).toString());
    }
  }, [selectedLocation, currentScore, isOwnerRetaining]);

  // Only show locations assigned to this driver; if none assigned, show all (to avoid empty state for existing data)
  const driverSpecificLocations = useMemo(() => locations.filter(l => l.assignedDriverId === currentDriver.id), [locations, currentDriver.id]);
  const isShowingAllLocations = driverSpecificLocations.length === 0 && locations.length > 0;
  const assignedLocations = isShowingAllLocations ? locations : driverSpecificLocations;
  const availableAreas = useMemo(() => Array.from(new Set(assignedLocations.map(l => l.area).filter(Boolean))).sort(), [assignedLocations]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDriverTransactions = useMemo(
    () => allTransactions.filter(t => t.driverId === currentDriver.id && t.timestamp.startsWith(todayStr) && (t.type === undefined || t.type === 'collection')),
    [allTransactions, currentDriver.id, todayStr]
  );
  const visitedLocationIds = useMemo(() => new Set(todayDriverTransactions.map(t => t.locationId)), [todayDriverTransactions]);

  const locationCards = useMemo(() => {
    const lowerSearch = searchQuery.toLowerCase();

    return assignedLocations
      .map(loc => {
        const distanceMeters = gpsCoords && loc.coords
          ? getDistance(gpsCoords.lat, gpsCoords.lng, loc.coords.lat, loc.coords.lng)
          : null;
        const daysSinceActive = loc.lastRevenueDate
          ? Math.floor((Date.now() - new Date(loc.lastRevenueDate).getTime()) / 86400000)
          : null;
        const isUrgent = loc.lastScore >= 9000 || loc.status === 'broken' || (daysSinceActive !== null && daysSinceActive >= CONSTANTS.STAGNANT_DAYS_THRESHOLD);
        const isNearby = distanceMeters !== null && distanceMeters <= NEARBY_DISTANCE_METERS;
        const isPending = !visitedLocationIds.has(loc.id);
        const isLocked = loc.resetLocked === true;
        // Priority favors actionable stops first: pending work, urgent machines,
        // unlocked and nearby sites, then active machines, before distance lowers rank.
        const priorityScore =
          (isPending ? PRIORITY_PENDING_WEIGHT : 0) +
          (isUrgent ? PRIORITY_URGENT_WEIGHT : 0) +
          (isLocked ? PRIORITY_LOCKED_PENALTY : 0) +
          (isNearby ? PRIORITY_NEARBY_WEIGHT : 0) +
          (loc.status === 'active' ? PRIORITY_ACTIVE_WEIGHT : 0) -
          Math.min(PRIORITY_DISTANCE_CAP_KM, Math.floor((distanceMeters ?? PRIORITY_DISTANCE_FALLBACK) / 1000));

        return { loc, distanceMeters, daysSinceActive, isUrgent, isNearby, isPending, isLocked, priorityScore };
      })
      .filter(({ loc, isPending, isUrgent, isNearby }) => {
        const matchSearch = !searchQuery ||
          loc.name.toLowerCase().includes(lowerSearch) ||
          loc.machineId.toLowerCase().includes(lowerSearch) ||
          loc.area.toLowerCase().includes(lowerSearch);
        const matchArea = selectedArea === 'all' || loc.area === selectedArea;
        const matchQuickFilter =
          locationFilter === 'all' ||
          (locationFilter === 'pending' && isPending) ||
          (locationFilter === 'urgent' && isUrgent) ||
          (locationFilter === 'nearby' && isNearby);
        return matchSearch && matchArea && matchQuickFilter;
      })
      .sort((a, b) => {
        const distanceA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const distanceB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return a.loc.name.localeCompare(b.loc.name);
      });
  }, [assignedLocations, gpsCoords, searchQuery, selectedArea, locationFilter, visitedLocationIds]);

  const collectionOverview = useMemo(() => ({
    totalMachines: assignedLocations.length,
    pendingStops: locationCards.filter(item => item.isPending).length,
    urgentMachines: locationCards.filter(item => item.isUrgent).length,
    nearbySites: locationCards.filter(item => item.isNearby).length,
  }), [assignedLocations.length, locationCards]);

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
      alert(lang === 'zh' ? "Cannot access camera" : "Camera access denied");
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
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'YOUR_KEY') {
        throw new Error("Missing API Key");
      }

      const ai = new GoogleGenAI({ apiKey });
      const modelName = 'gemini-1.5-flash';
      
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
    } catch (e: any) {
      console.error("AI Analysis failed:", e.message);
      if (e.message.includes("API Key") || e.message.includes("403")) {
        alert(lang === 'zh' ? "AI key invalid, switching to manual mode." : "AI unavailable, using manual photo mode.");
        takeManualPhoto();
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleConfirmAI = () => {
     if (aiReviewData) {
         // 将 AI 识别结果填入，但保留司机的修改权
         setCurrentScore(aiReviewData.score);
         setPhotoData(aiReviewData.image);
         
         // 记录 AI 原始分值供比对
         setAiReviewData({...aiReviewData, confirmed: true} as any); 
         stopScanner();
         alert(lang === 'zh' ? '✅ AI reading filled in, please verify' : '✅ AI reading filled in, please verify');
     }
  };

  const handleRetake = () => {
      setAiReviewData(null);
      setScannerStatus('scanning');
      scanIntervalRef.current = window.setInterval(captureAndAnalyze, 2000); // 降低采样频率至 2s
      isProcessingRef.current = false;
  };

  const processSubmission = async (resolvedGps: {lat: number, lng: number}, gpsSourceType: 'live' | 'exif' | 'estimated' | 'none' = 'live') => {
      setStatus('uploading');
      
      const expenseValue = parseInt(expenses) || 0;
      const userScore = parseInt(currentScore) || (selectedLocation?.lastScore || 0);
      const recognizedScore = aiReviewData?.score ? parseInt(aiReviewData.score) : undefined;
      
      const isAnomaly = recognizedScore !== undefined ? Math.abs(userScore - recognizedScore) > 50 : false;
      
      const tx: Transaction = {
        id: draftTxId || `TX-${Date.now()}`,
        timestamp: new Date().toISOString(), 
        locationId: selectedLocation!.id, 
        locationName: selectedLocation!.name,
        driverId: currentDriver.id, 
        driverName: currentDriver.name,
        previousScore: selectedLocation!.lastScore, 
        currentScore: userScore,
        revenue: calculations.revenue, 
        commission: calculations.commission, 
        ownerRetention: calculations.finalRetention,
        debtDeduction: 0, startupDebtDeduction: 0,
        
        expenses: expenseValue, 
        expenseType: expenseValue > 0 ? expenseType : undefined,
        expenseCategory: expenseValue > 0 ? expenseCategory : undefined,
        expenseStatus: expenseValue > 0 ? 'pending' : undefined,
        
        coinExchange: parseInt(coinExchange) || 0, extraIncome: 0,
        netPayable: calculations.netPayable,
        gps: resolvedGps, 
        photoUrl: photoData || undefined, 
        dataUsageKB: 120, isSynced: false,
        paymentStatus: 'paid',
        
        aiScore: recognizedScore,
        isAnomaly: isAnomaly,
        reportedStatus: (aiReviewData?.condition === 'Damaged' ? 'broken' : 'active') as any,
        notes: [
          aiReviewData?.notes,
          gpsSourceType !== 'live' ? `[GPS: ${gpsSourceType}]` : null
        ].filter(Boolean).join(' ') || undefined
      };

      // Always save to IndexedDB offline queue for resilience
      try {
        await enqueueTransaction(tx);
      } catch (e) {
        console.warn('[CollectionForm] IDB enqueue failed:', e);
      }
      
      // Also call parent handler (works online AND offline — parent saves to localStorage)
      onSubmit(tx);
      
      // Update queue count
      getPendingTransactions().then((list) => setOfflineQueueCount(list.length)).catch(() => {});
      
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
      setCoinExchange('');
      setIsOwnerRetaining(true);
      setAiReviewData(null);
      setExpenseType('public');
      setExpenseCategory('fuel');
      setGpsSource(null);

      const savedMsg = !isOnline
        ? (lang === 'zh' ? '✅ 离线已保存！恢复网络后自动上传。' : '✅ Saved offline! Will auto-upload when connected.')
        : (lang === 'zh' ? '✅ 采集记录已保存' : '✅ Collection report saved');
      alert(savedMsg);
  };

  const handleSubmit = async () => {
    if (!selectedLocation || status !== 'idle') return;
    
    if (calculations.isCoinStockNegative && !confirm(lang === 'zh' ? "⚠️ Coin stock insufficient, continue?" : "⚠️ Coin stock insufficient, continue?")) return;

    // 1. Try live GPS (best accuracy)
    if (gpsCoords) {
      setGpsSource('live');
      processSubmission(gpsCoords, 'live');
      return;
    }

    // 2. Try EXIF GPS from photo
    if (photoData) {
      setStatus('gps');
      const exifGps = await extractGpsFromExif(photoData);
      if (exifGps) {
        setGpsSource('exif');
        processSubmission(exifGps, 'exif');
        return;
      }
    }

    // Re-check live GPS in case it became available while awaiting EXIF
    if (gpsCoords) {
      setGpsSource('live');
      processSubmission(gpsCoords, 'live');
      return;
    }
    // 3. Try machine's registered coordinates (estimated)
    const estimated = estimateLocationFromContext(gpsCoords, selectedLocation?.coords || null);
    if (estimated) {
      const confirmEst = confirm(
        lang === 'zh'
          ? '⚠️ 无法获取GPS，将使用网点坐标估算位置。继续提交？'
          : '⚠️ No GPS available. Will use site coordinates as estimated location. Continue?'
      );
      if (confirmEst) {
        setGpsSource('estimated');
        processSubmission(estimated, 'estimated');
        return;
      }
      setStatus('idle');
      return;
    }

    // 4. Last resort: submit without GPS (0,0) after confirmation
    const confirmNoGps = confirm(
      lang === 'zh'
        ? '❌ 无GPS信号。是否仍要保存记录？（将标注为无位置）'
        : '❌ No GPS signal. Save record without location? (marked as offline)'
    );
    if (confirmNoGps) {
      setGpsSource(null);
      processSubmission({ lat: 0, lng: 0 }, 'none');
    } else {
      setStatus('idle');
      requestGps();
    }
  };

  // --- 9999 Reset Request Handler ---
  const handleResetPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBlob = await compressAndResizeImage(file);
        const reader = new FileReader();
        reader.readAsDataURL(compressedBlob);
        reader.onloadend = () => {
          setResetPhotoData(reader.result as string);
        };
      } catch (err) {
        console.error("Compression failed", err);
      }
    }
  };

  const handleSubmitResetRequest = () => {
    if (!resetRequestLocId || !resetPhotoData) {
      alert(lang === 'zh' ? '❌ 请拍照当前分数照片' : '❌ Photo of current score required!');
      return;
    }
    const loc = locations.find(l => l.id === resetRequestLocId);
    if (!loc) return;

    const gps = gpsCoords || { lat: 0, lng: 0 };
    const tx: Transaction = {
      id: `RST-${Date.now()}`,
      timestamp: new Date().toISOString(),
      locationId: loc.id,
      locationName: loc.name,
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      previousScore: loc.lastScore,
      currentScore: loc.lastScore,
      revenue: 0, commission: 0, ownerRetention: 0,
      debtDeduction: 0, startupDebtDeduction: 0,
      expenses: 0, coinExchange: 0, extraIncome: 0,
      netPayable: 0,
      gps, photoUrl: resetPhotoData,
      dataUsageKB: 80, isSynced: false,
      type: 'reset_request',
      approvalStatus: 'pending',
      notes: lang === 'zh' ? '9999爆机重置申请' : '9999 overflow reset request'
    };
    onSubmit(tx);
    setResetRequestLocId(null);
    setResetPhotoData(null);
    alert(lang === 'zh' ? '✅ 重置申请已提交，等待老板审批' : '✅ Reset request submitted, awaiting approval');
  };

  // --- Payout (Dividend Withdrawal) Request Handler ---
  const handleSubmitPayoutRequest = () => {
    const parsedAmount = parseInt(payoutAmount, 10);
    if (!payoutRequestLocId || !payoutAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      alert(lang === 'zh' ? '❌ 请输入有效提现金额' : '❌ Enter a valid payout amount!');
      return;
    }
    const loc = locations.find(l => l.id === payoutRequestLocId);
    if (!loc) return;

    const availableBalance = loc.dividendBalance || 0;
    if (parsedAmount > availableBalance) {
      alert(lang === 'zh' ? `❌ 提现金额超过可用余额 (TZS ${availableBalance.toLocaleString()})` : `❌ Amount exceeds available balance (TZS ${availableBalance.toLocaleString()})`);
      return;
    }

    const gps = gpsCoords || { lat: 0, lng: 0 };
    const tx: Transaction = {
      id: `PAY-${Date.now()}`,
      timestamp: new Date().toISOString(),
      locationId: loc.id,
      locationName: loc.name,
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      previousScore: loc.lastScore,
      currentScore: loc.lastScore,
      revenue: 0, commission: 0, ownerRetention: 0,
      debtDeduction: 0, startupDebtDeduction: 0,
      expenses: 0, coinExchange: 0, extraIncome: 0,
      netPayable: 0,
      gps, dataUsageKB: 40, isSynced: false,
      type: 'payout_request',
      approvalStatus: 'pending',
      payoutAmount: parsedAmount,
      notes: lang === 'zh' ? `店主分红提现: TZS ${parsedAmount.toLocaleString()}` : `Owner dividend payout: TZS ${parsedAmount.toLocaleString()}`
    };
    onSubmit(tx);
    setPayoutRequestLocId(null);
    setPayoutAmount('');
    alert(lang === 'zh' ? '✅ 提现申请已提交，等待老板审批' : '✅ Payout request submitted, awaiting approval');
  };


  // ─── Wizard step indicator ──────────────────────────────────────────
  // Maps the string step names to visual step numbers (2, 3, 4).
  // Step 1 (selection) has its own full-page layout and no bar.
  const WIZARD_STEPS: Array<{ key: 'capture' | 'amounts' | 'confirm'; label: string }> = [
    { key: 'capture',  label: lang === 'sw' ? 'Picha'     : '拍照' },
    { key: 'amounts',  label: lang === 'sw' ? 'Fedha'     : '金额' },
    { key: 'confirm',  label: lang === 'sw' ? 'Wasilisha' : '提交' },
  ];

  const WizardStepBar = ({ current }: { current: 'capture' | 'amounts' | 'confirm' }) => {
    const currentIdx = WIZARD_STEPS.findIndex(s => s.key === current);
    return (
      <div className="flex items-center gap-2 mb-5">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = s.key === current;
          return (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${
                active ? 'bg-indigo-600 text-white' :
                done    ? 'bg-emerald-100 text-emerald-600' :
                          'bg-slate-100 text-slate-400'
              }`}>
                {done ? <CheckCircle2 size={10} /> : <span>{i + 2}</span>}
                {s.label}
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ─── Location sub-header (steps 2-4) ────────────────────────────────
  const LocationSubHeader = ({ onBack }: { onBack: () => void }) => (
    <div className="flex items-center gap-3 mb-5">
      <button
        onClick={onBack}
        className="p-2.5 bg-white border border-slate-200 rounded-subcard text-slate-500 hover:text-indigo-600 shadow-field transition-colors flex-shrink-0"
      >
        <ArrowRight size={18} className="rotate-180" />
      </button>
      <div className="min-w-0">
        <h2 className="text-base font-black text-slate-900 truncate leading-tight">{selectedLocation?.name}</h2>
        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em]">
          {selectedLocation?.machineId} • {((selectedLocation?.commissionRate ?? 0) * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );

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

  // ─── 9999 Reset Request View ─────────────────────────────────────────
  if (resetRequestLocId) {
    const resetLoc = locations.find(l => l.id === resetRequestLocId);
    return (
      <div className="max-w-md mx-auto py-6 px-4 animate-in fade-in">
        <div className="bg-white rounded-card p-6 border border-slate-200 shadow-field-md space-y-5">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <button
              onClick={() => { setResetRequestLocId(null); setResetPhotoData(null); }}
              className="p-2.5 bg-slate-100 rounded-subcard text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowRight size={18} className="rotate-180" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-black text-slate-900">{t.resetRequest}</h2>
              <p className="text-[10px] font-black text-rose-500 uppercase mt-1">{resetLoc?.name} • {resetLoc?.machineId}</p>
            </div>
            <div className="w-10" />
          </div>

          <div className="bg-rose-50 p-4 rounded-subcard border border-rose-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500 rounded-btn text-white flex-shrink-0"><RefreshCw size={16} /></div>
              <div>
                <p className="text-xs font-black text-rose-800 uppercase">{t.resetRequestDesc}</p>
                <p className="text-[9px] font-bold text-rose-400 mt-0.5">
                  {lang === 'zh' ? `当前分数: ${resetLoc?.lastScore}` : `Current score: ${resetLoc?.lastScore}`}
                </p>
              </div>
            </div>
          </div>

          <div
            onClick={() => resetFileRef.current?.click()}
            className={`relative h-36 w-full rounded-subcard overflow-hidden border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${resetPhotoData ? 'border-emerald-400' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
          >
            <input type="file" accept="image/*" ref={resetFileRef} onChange={handleResetPhotoCapture} className="hidden" />
            {resetPhotoData ? (
              <>
                <img src={resetPhotoData} className="w-full h-full object-cover" alt="Reset proof" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold uppercase">
                  <CheckCircle2 size={14} className="mr-1" /> {lang === 'zh' ? '点击重拍' : 'Tap to retake'}
                </div>
              </>
            ) : (
              <div className="text-center text-slate-400">
                <Camera size={24} className="mx-auto mb-2" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {lang === 'zh' ? '拍摄当前分数照片 *' : 'Photo of current score *'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmitResetRequest}
            disabled={!resetPhotoData}
            className="w-full py-4 bg-rose-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <RefreshCw size={18} />
            {lang === 'zh' ? '提交重置申请' : 'Submit Reset Request'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Payout Request View ─────────────────────────────────────────────
  if (payoutRequestLocId) {
    const payoutLoc = locations.find(l => l.id === payoutRequestLocId);
    const availableDividend = payoutLoc?.dividendBalance || 0;
    const parsedPayoutAmount = parseInt(payoutAmount, 10);
    const isValidAmount = !isNaN(parsedPayoutAmount) && parsedPayoutAmount > 0;
    const exceedsBalance = isValidAmount && parsedPayoutAmount > availableDividend;
    return (
      <div className="max-w-md mx-auto py-6 px-4 animate-in fade-in">
        <div className="bg-white rounded-card p-6 border border-slate-200 shadow-field-md space-y-5">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <button
              onClick={() => { setPayoutRequestLocId(null); setPayoutAmount(''); }}
              className="p-2.5 bg-slate-100 rounded-subcard text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowRight size={18} className="rotate-180" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-black text-slate-900">{t.payoutRequest}</h2>
              <p className="text-[10px] font-black text-emerald-500 uppercase mt-1">{payoutLoc?.name} • {payoutLoc?.ownerName || '---'}</p>
            </div>
            <div className="w-10" />
          </div>

          <div className="bg-emerald-50 p-4 rounded-subcard border border-emerald-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500 rounded-btn text-white flex-shrink-0"><Wallet size={16} /></div>
              <div>
                <p className="text-xs font-black text-emerald-800 uppercase">{t.payoutRequestDesc}</p>
                <p className="text-[9px] font-bold text-emerald-400 mt-0.5">
                  {lang === 'zh' ? `店主: ${payoutLoc?.ownerName || 'N/A'}` : `Owner: ${payoutLoc?.ownerName || 'N/A'}`}
                </p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-btn border border-emerald-100 text-center">
              <p className="text-[8px] font-black text-emerald-400 uppercase mb-0.5">
                {lang === 'zh' ? '可提现余额' : 'Available Balance'}
              </p>
              <p className="text-2xl font-black text-emerald-700">TZS {availableDividend.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-subcard border border-slate-200">
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">{t.payoutAmount}</label>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-black text-slate-300">TZS</span>
              <input
                type="number"
                value={payoutAmount}
                onChange={e => setPayoutAmount(e.target.value)}
                className="w-full text-3xl font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200"
                placeholder="0"
              />
            </div>
            {exceedsBalance && (
              <p className="text-[9px] font-black text-rose-500 mt-2">
                {lang === 'zh' ? `⚠ 超过可用余额 (TZS ${availableDividend.toLocaleString()})` : `⚠ Exceeds available balance (TZS ${availableDividend.toLocaleString()})`}
              </p>
            )}
          </div>

          <button
            onClick={handleSubmitPayoutRequest}
            disabled={!isValidAmount || exceedsBalance}
            className="w-full py-4 bg-emerald-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Wallet size={18} />
            {lang === 'zh' ? '提交提现申请' : 'Submit Payout Request'}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 1 — Machine Selection
  // ══════════════════════════════════════════════════════════════════════
  if (step === 'selection') {
    return (
      <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
        {/* Offline status banner */}
        {!isOnline && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-subcard">
            <WifiOff size={16} className="text-amber-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black text-amber-700 uppercase">
                {lang === 'zh' ? '离线模式 — 数据已本地保存' : 'Offline Mode — Data saved locally'}
              </p>
              <p className="text-[8px] font-bold text-amber-600">
                {lang === 'zh' ? '恢复网络后自动同步到云端' : 'Auto-syncs when connection returns'}
              </p>
            </div>
            {offlineQueueCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-200 rounded-tag flex-shrink-0">
                <DatabaseBackup size={10} className="text-amber-700" />
                <span className="text-[8px] font-black text-amber-700">{offlineQueueCount}</span>
              </div>
            )}
          </div>
        )}

        {/* Online with pending queue */}
        {isOnline && offlineQueueCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-subcard">
            <DatabaseBackup size={16} className="text-indigo-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-indigo-700 uppercase">
                {lang === 'zh' ? `${offlineQueueCount} 条离线记录正在同步...` : `Syncing ${offlineQueueCount} offline records...`}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-2 px-1">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase">
              <ScanLine className="text-indigo-600" size={20} />
              {t.selectMachine}
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              {todayDriverTransactions.length} {t.todaysCollections}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-subcard shadow-field">
            <Coins size={13} className="text-emerald-400" />
            <span className="text-xs font-black text-white">{(currentDriver?.dailyFloatingCoins ?? 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-subcard border border-slate-200 p-3.5 shadow-field">
            <p className="text-[9px] font-black text-slate-400 uppercase">{t.totalMachines}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{collectionOverview.totalMachines}</p>
          </div>
          <div className="bg-white rounded-subcard border border-slate-200 p-3.5 shadow-field">
            <p className="text-[9px] font-black text-slate-400 uppercase">{t.pendingStops}</p>
            <p className="text-xl font-black text-indigo-600 mt-1">{collectionOverview.pendingStops}</p>
          </div>
          <div className="bg-amber-50 rounded-subcard border border-amber-200 p-3.5 shadow-field">
            <p className="text-[9px] font-black text-amber-500 uppercase">{t.urgentMachines}</p>
            <p className="text-xl font-black text-amber-700 mt-1">{collectionOverview.urgentMachines}</p>
          </div>
          <div className="bg-emerald-50 rounded-subcard border border-emerald-200 p-3.5 shadow-field">
            <p className="text-[9px] font-black text-emerald-500 uppercase">{t.nearbySites}</p>
            <p className="text-xl font-black text-emerald-700 mt-1">
              {gpsCoords ? collectionOverview.nearbySites : '-'}
            </p>
            {!gpsCoords && (
              <p className="text-[8px] font-bold text-emerald-500 uppercase mt-0.5">{t.awaitingGps}</p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.enterId}
            className="w-full bg-white border border-slate-200 rounded-card py-4 pl-12 pr-5 text-sm font-bold shadow-field outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_130px] gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ['all', t.quickFilterAll, collectionOverview.totalMachines],
              ['pending', t.quickFilterPending, collectionOverview.pendingStops],
              ['urgent', t.quickFilterUrgent, collectionOverview.urgentMachines],
              ['nearby', t.quickFilterNearby, collectionOverview.nearbySites],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLocationFilter(key)}
                className={`px-3 py-1.5 rounded-btn text-[10px] font-black uppercase transition-all border ${
                  locationFilter === key
                    ? 'bg-slate-900 text-white border-slate-900 shadow-field'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                {label} <span className="ml-1 opacity-60">{count}</span>
              </button>
            ))}
          </div>
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-btn px-4 py-2.5 text-[10px] font-black uppercase text-slate-600 outline-none shadow-field"
          >
            <option value="all">{t.allAreas}</option>
            {availableAreas.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>

        {/* Register new machine */}
        {onRegisterMachine && (
          <button
            onClick={() => setIsRegistering(true)}
            className="w-full py-3.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-btn font-black uppercase text-xs hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            {t.registerNewMachine}
          </button>
        )}

        <div className="space-y-3">
          {isShowingAllLocations && (
            <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-subcard flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
              <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
                {lang === 'zh' ? 'Showing all machines (none assigned)' : 'Showing all machines (none assigned)'}
              </p>
            </div>
          )}
          {locationCards.length === 0 && (
            <div className="py-14 text-center bg-white rounded-card border border-dashed border-slate-200">
              <Layers size={36} className="mx-auto text-slate-200 mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.noMachinesAssigned}</p>
            </div>
          )}
          {locationCards.map(({ loc, daysSinceActive, distanceMeters, isLocked, isUrgent, isPending }) => {
            const machineShortId = loc.machineId ? loc.machineId.substring(0, 6).toUpperCase() : '---';
            const isNear9999 = loc.lastScore >= 9000;
            return (
              <div key={loc.id} className="bg-white rounded-subcard border border-slate-200 shadow-field hover:shadow-field-md transition-shadow overflow-hidden">
                <button
                  onClick={() => { if (!isLocked) handleSelectLocation(loc.id); }}
                  disabled={isLocked}
                  className={`w-full group active:scale-[0.98] transition-transform ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-stretch">
                    {/* Machine ID badge */}
                    <div className={`relative w-16 shrink-0 flex flex-col items-center justify-center p-2 rounded-l-subcard transition-colors ${isLocked ? 'bg-rose-800' : 'bg-slate-900 group-hover:bg-indigo-700'}`}>
                      {loc.machinePhotoUrl ? (
                        <img src={loc.machinePhotoUrl} alt={loc.name} className="w-full h-full object-cover absolute inset-0 opacity-40 rounded-l-subcard" />
                      ) : null}
                      {isLocked ? (
                        <Lock size={14} className="relative z-10 text-white" />
                      ) : (
                        <span className="relative z-10 text-white font-black text-[9px] text-center leading-tight">{machineShortId}</span>
                      )}
                      <div className={`relative z-10 mt-1 w-2 h-2 rounded-full ${isLocked ? 'bg-rose-400 animate-pulse' : loc.status === 'active' ? 'bg-emerald-400' : loc.status === 'maintenance' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                    </div>
                    {/* Machine details */}
                    <div className="flex-1 p-3.5 text-left">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-900 text-sm font-black leading-tight">{loc.name}</span>
                        {isLocked ? (
                          <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-tag uppercase">{t.resetLocked}</span>
                        ) : (
                          <ChevronRight size={15} className="text-slate-300 group-hover:text-indigo-500 mt-0.5 transition-colors shrink-0" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase">Last</p>
                          <p className={`text-[10px] font-black ${isNear9999 ? 'text-rose-600' : 'text-indigo-600'}`}>{loc.lastScore.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase">Comm.</p>
                          <p className="text-[10px] font-black text-emerald-600">{(loc.commissionRate * 100).toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase">{lang === 'zh' ? '分红' : 'Div.'}</p>
                          <p className="text-[10px] font-black text-amber-600">TZS {(loc.dividendBalance || 0).toLocaleString()}</p>
                        </div>
                      </div>
                      {loc.area && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-tag border border-slate-100">{loc.area}</span>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded-tag border ${isPending ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                            {isPending ? t.pendingToday : t.visitedToday}
                          </span>
                          {distanceMeters !== null ? (
                            <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-tag border border-emerald-100">
                              {Math.round(distanceMeters)}m
                            </span>
                          ) : (
                            <span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-tag border border-slate-200">
                              {t.awaitingGps}
                            </span>
                          )}
                          {isUrgent && daysSinceActive !== null && daysSinceActive >= CONSTANTS.STAGNANT_DAYS_THRESHOLD && (
                            <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-tag border border-amber-100">
                              {t.staleMachine} {daysSinceActive}d
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {/* Action buttons: Reset / Payout */}
                {!isLocked && (
                  <div className="flex border-t border-slate-100">
                    {isNear9999 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); requestGps(); setResetRequestLocId(loc.id); }}
                        className="flex-1 py-2.5 text-[9px] font-black uppercase text-rose-500 hover:bg-rose-50 transition-colors flex items-center justify-center gap-1.5 border-r border-slate-100"
                      >
                        <RefreshCw size={11} /> {lang === 'zh' ? '9999重置' : '9999 Reset'}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); requestGps(); setPayoutRequestLocId(loc.id); }}
                      className="flex-1 py-2.5 text-[9px] font-black uppercase text-emerald-500 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Wallet size={11} /> {lang === 'zh' ? '分红提现' : 'Payout'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Offline Route Map — shows today's completed stops */}
        {allTransactions.length > 0 && (
          <OfflineRouteMap
            transactions={allTransactions}
            driverId={currentDriver.id}
            driverName={currentDriver.name}
            isOnline={isOnline}
            lang={lang}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 2 — Capture: Score Reading + Photo
  // ══════════════════════════════════════════════════════════════════════
  if (step === 'capture') {
    return (
      <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
        <WizardStepBar current="capture" />
        <LocationSubHeader onBack={handleBackToSelection} />

        {/* Score input */}
        <div className="bg-white rounded-subcard border border-slate-200 p-5 shadow-field">
          <label className="text-[10px] font-black text-slate-400 uppercase block mb-3 tracking-widest">{t.currentReading}</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={currentScore}
              onChange={e => setCurrentScore(e.target.value)}
              className="w-1/2 text-4xl font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200"
              placeholder="0000"
              inputMode="numeric"
              autoFocus
            />
            <button
              onClick={startScanner}
              className={`flex-1 py-3.5 rounded-subcard shadow-field flex items-center justify-center gap-2 transition-all active:scale-95 ${currentScore ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-slate-900 text-white'}`}
            >
              {currentScore ? <CheckCircle2 size={16} /> : <Scan size={16} />}
              <span className="text-[10px] font-black uppercase tracking-widest">{currentScore ? t.reScan : t.scanner}</span>
            </button>
          </div>

          {/* Photo preview */}
          {photoData && !isScannerOpen && (
            <div className="mt-4 h-24 w-full rounded-subcard overflow-hidden border border-slate-200 shadow-field relative">
              <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt="Proof" />
              <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
                <CheckCircle2 size={9} /> Photo
              </div>
            </div>
          )}

          {/* Revenue preview */}
          {currentScore && (
            <div className={`mt-4 p-4 rounded-subcard text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
              <div>
                <p className="text-[9px] font-black uppercase opacity-60">{t.diff} {calculations.diff}</p>
                <p className="text-[9px] font-black uppercase opacity-60">{calculations.diff} × 200 TZS</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
                <p className="text-[8px] opacity-60 uppercase">{t.revenue}</p>
              </div>
            </div>
          )}
        </div>

        {/* GPS acquiring status — compact */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-subcard border ${
          gpsPermission === 'denied' ? 'bg-rose-50 border-rose-200' :
          gpsCoords ? 'bg-emerald-50 border-emerald-200' :
          'bg-slate-50 border-slate-200'
        }`}>
          <div className={`p-1.5 rounded-btn flex-shrink-0 ${
            gpsPermission === 'denied' ? 'bg-rose-500 text-white' :
            gpsCoords ? 'bg-emerald-500 text-white' :
            'bg-slate-400 text-white'
          }`}>
            <Satellite size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[9px] font-black uppercase ${
              gpsPermission === 'denied' ? 'text-rose-600' :
              gpsCoords ? 'text-emerald-700' :
              'text-slate-500'
            }`}>
              {gpsPermission === 'denied' ? 'GPS Denied — check browser settings' :
               gpsCoords ? `GPS Locked (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)})` :
               'Acquiring GPS...'}
            </p>
          </div>
          {!gpsCoords && (
            <button onClick={requestGps} className="p-1.5 bg-white rounded-btn shadow-field text-indigo-600 flex-shrink-0">
              <RotateCcw size={12} />
            </button>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={() => setStep('amounts')}
          disabled={!currentScore}
          className="w-full py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <ChevronRight size={18} />
          {lang === 'zh' ? '下一步：金额确认' : 'Next: Financial Details'}
        </button>

        {/* Scanner overlay */}
        {isScannerOpen && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in">
            <div className="relative flex-1">
              <video ref={videoRef} playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {scannerStatus === 'review' && aiReviewData ? (
                  <div className="bg-white/90 backdrop-blur-xl w-[90%] max-w-sm rounded-card p-5 shadow-field-md pointer-events-auto animate-in slide-in-from-bottom-10 duration-500 max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="p-2.5 bg-indigo-600 rounded-subcard text-white shadow-field">
                        <BrainCircuit size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 uppercase">{t.aiReviewTitle}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Review & Confirm</p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-5">
                      <div className="h-36 rounded-subcard overflow-hidden border border-slate-100 bg-black">
                        <img src={aiReviewData.image} className="w-full h-full object-contain" alt="Captured" />
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-subcard border border-slate-200">
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">{t.counterScore}</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            value={aiReviewData.score}
                            onChange={e => setAiReviewData({...aiReviewData, score: e.target.value})}
                            className="text-3xl font-black text-slate-900 bg-transparent w-full outline-none border-b border-dashed border-slate-300 focus:border-indigo-500 placeholder:text-slate-200"
                            placeholder="0000"
                          />
                          <Edit2 size={14} className="text-slate-400 flex-shrink-0" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase block">{t.machineCondition}</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAiReviewData({...aiReviewData, condition: 'Normal'})}
                            className={`flex-1 py-2.5 rounded-subcard border flex flex-col items-center gap-1 transition-all ${aiReviewData.condition === 'Normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 text-slate-400'}`}
                          >
                            <CheckCircle2 size={16} />
                            <span className="text-[10px] font-black uppercase">Normal</span>
                          </button>
                          <button
                            onClick={() => setAiReviewData({...aiReviewData, condition: 'Damaged'})}
                            className={`flex-1 py-2.5 rounded-subcard border flex flex-col items-center gap-1 transition-all ${aiReviewData.condition === 'Damaged' ? 'bg-rose-50 border-rose-200 text-rose-600 ring-2 ring-rose-500/20' : 'bg-white border-slate-200 text-slate-400'}`}
                          >
                            <AlertTriangle size={16} />
                            <span className="text-[10px] font-black uppercase">Issue</span>
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-subcard border border-slate-200">
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">{t.notes}</label>
                        <textarea
                          value={aiReviewData.notes}
                          onChange={e => setAiReviewData({...aiReviewData, notes: e.target.value})}
                          className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none resize-none h-12"
                          placeholder={t.notesPlaceholder}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={handleRetake} className="py-3.5 bg-slate-100 text-slate-500 rounded-subcard font-black uppercase text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                        <RotateCcw size={13} /> {t.retake}
                      </button>
                      <button onClick={handleConfirmAI} className="py-3.5 bg-indigo-600 text-white rounded-subcard font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2">
                        <CheckCircle2 size={13} /> {t.confirmFill}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`w-72 h-72 border-2 rounded-[40px] relative transition-all duration-700 ${scannerStatus === 'scanning' ? 'border-white/20' : 'border-emerald-500 scale-105'}`}>
                    {scannerStatus === 'scanning' && <div className="absolute top-0 left-6 right-6 h-1 bg-red-500 shadow-[0_0_20px_#ef4444] animate-scan-y rounded-full" />}
                    <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
                    <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
                    <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
                  </div>
                )}
              </div>

              <div className="absolute bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
                <div className="flex items-center gap-6 pointer-events-auto">
                  <button onClick={stopScanner} className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all">
                    <X size={22} />
                  </button>
                  {scannerStatus === 'scanning' && (
                    <button onClick={takeManualPhoto} className="w-18 h-18 bg-white rounded-full border-4 border-slate-200 flex items-center justify-center shadow-field-md active:scale-95 transition-all w-[72px] h-[72px]">
                      <div className="w-14 h-14 rounded-full border-2 border-slate-900" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 3 — Amounts: Retention + Expenses + Coin Exchange
  // ══════════════════════════════════════════════════════════════════════
  if (step === 'amounts') {
    return (
      <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
        <WizardStepBar current="amounts" />
        <LocationSubHeader onBack={() => setStep('capture')} />

        {/* Revenue summary */}
        <div className={`p-4 rounded-subcard text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
          <div>
            <p className="text-[9px] font-black uppercase opacity-60">{t.formula}</p>
            <p className="text-[9px] font-bold opacity-50">({currentScore} − {selectedLocation?.lastScore}) × 200</p>
          </div>
          <div className="text-right">
            {calculations.revenue > 50000 && (
              <div className="flex items-center gap-1 justify-end mb-1">
                <Trophy size={10} className="text-yellow-300" />
                <span className="text-[8px] font-black text-yellow-300 uppercase">High Value</span>
              </div>
            )}
            <p className="text-2xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
            <p className="text-[8px] opacity-60 uppercase">{t.revenue}</p>
          </div>
        </div>

        {/* Owner Retention */}
        <div className={`p-4 rounded-subcard border transition-all ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex justify-between items-center mb-3">
            <label className={`text-[10px] font-black uppercase flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-slate-400'}`}>
              <HandCoins size={13} /> {t.retention}
            </label>
            <button
              type="button"
              onClick={() => setIsOwnerRetaining(!isOwnerRetaining)}
              className={`relative w-9 h-5 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isOwnerRetaining ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
          {isOwnerRetaining ? (
            <div className="space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-black text-amber-300">TZS</span>
                <input
                  type="number"
                  value={ownerRetention}
                  onChange={e => setOwnerRetention(e.target.value)}
                  className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200"
                  placeholder="0"
                />
              </div>
              <p className="text-[8px] font-black text-amber-400 uppercase">{(selectedLocation!.commissionRate * 100).toFixed(0)}% Left at machine</p>
            </div>
          ) : (
            <div className="p-3 bg-indigo-600 text-white rounded-btn flex items-center gap-2.5">
              <ShieldAlert size={16} />
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase">{t.fullCollect}</p>
                <p className="text-[8px] font-bold opacity-80 mt-0.5">TZS {calculations.commission.toLocaleString()} recorded as debt</p>
              </div>
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="bg-rose-50 p-4 rounded-subcard border border-rose-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-black text-rose-500 uppercase flex items-center gap-2">
              <Banknote size={13} /> Expenses / Advance
            </label>
            {parseInt(expenses) > 0 && (
              <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded-tag text-[8px] font-black uppercase">PENDING</span>
            )}
          </div>

          <div className="flex bg-white/60 p-1 rounded-btn mb-3">
            <button
              onClick={() => setExpenseType('public')}
              className={`flex-1 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${expenseType === 'public' ? 'bg-rose-500 text-white shadow-field' : 'text-rose-400 hover:bg-rose-100'}`}
            >
              Company
            </button>
            <button
              onClick={() => setExpenseType('private')}
              className={`flex-1 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${expenseType === 'private' ? 'bg-indigo-500 text-white shadow-field' : 'text-rose-400 hover:bg-rose-100'}`}
            >
              Driver Advance
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={expenseCategory}
              onChange={e => setExpenseCategory(e.target.value as any)}
              className="bg-white border border-rose-100 rounded-btn px-2 py-2 text-[10px] font-black text-rose-600 outline-none uppercase w-28 flex-shrink-0"
            >
              {expenseType === 'public' ? (
                <>
                  <option value="fuel">Fuel</option>
                  <option value="repair">Repair</option>
                  <option value="fine">Fine</option>
                  <option value="other">Other</option>
                </>
              ) : (
                <>
                  <option value="allowance">Meal Allow.</option>
                  <option value="salary_advance">Salary Adv.</option>
                  <option value="other">Personal</option>
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
        </div>

        {/* Coin Exchange */}
        <div className="bg-emerald-50 p-4 rounded-subcard border border-emerald-100">
          <label className="text-[10px] font-black text-emerald-600 uppercase block mb-2 tracking-widest">{t.exchange}</label>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-btn text-white flex-shrink-0"><Coins size={16} /></div>
            <input
              type="number"
              value={coinExchange}
              onChange={e => setCoinExchange(e.target.value)}
              className="w-full text-2xl font-black bg-transparent outline-none text-emerald-900 placeholder:text-emerald-200"
              placeholder="0"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStep('capture')}
            className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight size={15} className="rotate-180" />
            {lang === 'zh' ? '返回' : 'Back'}
          </button>
          <button
            onClick={() => setStep('confirm')}
            className="py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {lang === 'zh' ? '确认提交' : 'Review & Submit'}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP 4 — Confirm: Summary + GPS + Submit
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-md mx-auto py-4 px-4 pb-20 animate-in fade-in space-y-4">
      <WizardStepBar current="confirm" />
      <LocationSubHeader onBack={() => setStep('amounts')} />

      {/* Net payable — big display */}
      <div className="bg-slate-900 rounded-subcard p-5 text-white flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60">{t.net}</p>
          <p className="text-[8px] font-bold opacity-40 uppercase mt-0.5">{t.cashToHandIn}</p>
        </div>
        <p className="text-4xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
      </div>

      {/* Summary breakdown */}
      <div className="bg-white rounded-subcard border border-slate-200 shadow-field divide-y divide-slate-100">
        {[
          { label: t.revenue, value: `TZS ${calculations.revenue.toLocaleString()}`, color: 'text-slate-900' },
          { label: t.retention, value: `− TZS ${calculations.finalRetention.toLocaleString()}`, color: 'text-amber-600' },
          { label: t.expenses, value: `− TZS ${(parseInt(expenses) || 0).toLocaleString()}`, color: 'text-rose-500' },
          { label: t.exchange, value: `TZS ${(parseInt(coinExchange) || 0).toLocaleString()}`, color: 'text-emerald-600' },
          { label: t.coinStock, value: `${calculations.remainingCoins.toLocaleString()} ${t.coinUnit}`, color: calculations.isCoinStockNegative ? 'text-rose-600 font-black' : 'text-slate-500' },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
            <span className="text-[10px] font-black text-slate-400 uppercase">{row.label}</span>
            <span className={`text-[11px] font-black ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Photo thumbnail */}
      {photoData && (
        <div className="h-20 rounded-subcard overflow-hidden border border-slate-200 shadow-field relative">
          <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt="Proof" />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
            <CheckCircle2 size={9} /> Photo Attached
          </div>
        </div>
      )}

      {/* GPS status */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-subcard border ${
        gpsPermission === 'denied' ? 'bg-rose-50 border-rose-200' :
        gpsCoords ? 'bg-emerald-50 border-emerald-200' :
        'bg-slate-50 border-slate-200'
      }`}>
        <div className={`p-1.5 rounded-btn flex-shrink-0 ${
          gpsPermission === 'denied' ? 'bg-rose-500 text-white animate-pulse' :
          gpsCoords ? 'bg-emerald-500 text-white' :
          'bg-slate-400 text-white'
        }`}>
          <Satellite size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[9px] font-black uppercase ${
            gpsPermission === 'denied' ? 'text-rose-600' :
            gpsCoords ? 'text-emerald-700' :
            'text-slate-500'
          }`}>
            {gpsPermission === 'denied' ? 'GPS denied — open browser settings → allow location' :
             gpsCoords ? 'GPS location confirmed' :
             'Acquiring GPS signal...'}
          </p>
        </div>
        {!gpsCoords && gpsPermission !== 'denied' && (
          <button onClick={requestGps} className="p-1.5 bg-white rounded-btn shadow-field text-indigo-600 flex-shrink-0">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Coin stock warning */}
      {calculations.isCoinStockNegative && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-subcard">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-rose-700 uppercase">
            {lang === 'zh' ? '⚠ 硬币库存不足，请确认后提交' : '⚠ Coin stock insufficient — confirm before submit'}
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setStep('amounts')}
          className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
        >
          <ArrowRight size={15} className="rotate-180" />
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={status !== 'idle' || !currentScore || !photoData}
          className="py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {status !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {status === 'uploading' ? t.saving :
           !gpsCoords && gpsPermission !== 'denied' ? t.acquiringGps :
           t.confirmSubmit}
        </button>
      </div>
    </div>
  );
};

export default CollectionForm;

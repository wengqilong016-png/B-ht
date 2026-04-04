import React, { useState, useRef, useEffect } from 'react';
import { Scan, CheckCircle2, BrainCircuit, X, ArrowRight, RotateCcw, AlertTriangle, Satellite, Edit2, ChevronRight, WifiOff } from 'lucide-react';
import { useGpsCapture } from '../hooks/useGpsCapture';
import WizardStepBar from './WizardStepBar';
import { Location, Driver, TRANSLATIONS, AILog } from '../../types';
import type { AIReviewData } from '../hooks/useCollectionDraft';
import { usePerformanceMode } from '../hooks/usePerformanceMode';
import {
  compressCanvasImage,
  getOptimalVideoConstraints,
  getOptimalScanInterval,
  getOptimalAIImageSize,
  getOptimalEvidenceWidth,
  clearCanvasMemory,
  getMinimumAICallInterval,
} from '../utils/imageOptimization';

interface ReadingCaptureProps {
  selectedLocation: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  draftTxId: string;
  onLogAI: (log: AILog) => void;
  onUpdateScore: (score: string) => void;
  onUpdatePhoto: (photo: string | null) => void;
  onUpdateAiReview: (data: AIReviewData | null) => void;
  onUpdateGps: (coords: { lat: number; lng: number }) => void;
  onUpdateGpsPermission: (perm: 'prompt' | 'granted' | 'denied') => void;
  onNext: () => void;
  onBack: () => void;
  revenue: number;
  diff: number;
}

const ReadingCapture: React.FC<ReadingCaptureProps> = ({
  selectedLocation, currentDriver, lang, currentScore, photoData, aiReviewData,
  gpsCoords, gpsPermission, draftTxId, onLogAI,
  onUpdateScore, onUpdatePhoto, onUpdateAiReview, onUpdateGps, onUpdateGpsPermission,
  onNext, onBack, revenue, diff,
}) => {
  const t = TRANSLATIONS[lang];
  const { isLowPerformance } = usePerformanceMode();
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);

  const { coords: gpsHookCoords, status: gpsHookStatus, request: requestGps } = useGpsCapture(gpsCoords);

  // Keep draft in sync whenever the hook resolves coords or status
  useEffect(() => {
    if (gpsHookCoords) onUpdateGps(gpsHookCoords);
  }, [gpsHookCoords]);

  useEffect(() => {
    if (gpsHookStatus === 'granted') onUpdateGpsPermission('granted');
    else if (gpsHookStatus === 'denied') onUpdateGpsPermission('denied');
  }, [gpsHookStatus]);

  // Auto-request GPS on mount
  useEffect(() => { requestGps(); }, []);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'review'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const lastScanTimeRef = useRef<number>(0);

  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannerStatus('scanning');
    onUpdateAiReview(null);
    try {
      const videoConstraints = getOptimalVideoConstraints(isLowPerformance);
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        const scanInterval = getOptimalScanInterval(isLowPerformance);
        scanIntervalRef.current = window.setInterval(captureAndAnalyze, scanInterval);
      }
    } catch {
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
    isProcessingRef.current = false;
    lastScanTimeRef.current = 0; // Reset debounce timer
  };

  const takeManualPhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = compressCanvasImage(canvas, isLowPerformance);
      onUpdateAiReview({ score: '', condition: 'Normal', notes: '', image: base64 });
      setScannerStatus('review');
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

      clearCanvasMemory(canvas);
    }
  };

  const requestAiReview = async (imageBase64: string) => {
    const response = await fetch('/api/scan-meter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64 }),
    });

    if (response.status === 204) {
      throw new Error('AI_UNAVAILABLE');
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `AI request failed with ${response.status}`);
    }

    return response.json() as Promise<{ score: string; condition: string; notes: string }>;
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessingRef.current) return;
    if (videoRef.current.readyState !== 4) return;

    // Debounce to prevent rapid API calls
    const now = Date.now();
    const minInterval = getMinimumAICallInterval(isLowPerformance);
    if (now - lastScanTimeRef.current < minInterval) return;

    isProcessingRef.current = true;
    lastScanTimeRef.current = now;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) { isProcessingRef.current = false; return; }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const minDim = Math.min(vw, vh);
    const cropSize = minDim * 0.55;
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;

    const TARGET_SIZE = getOptimalAIImageSize(isLowPerformance);
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const base64Image = compressCanvasImage(canvas, isLowPerformance, { quality: isLowPerformance ? 0.5 : 0.6 }).split(',')[1];

    try {
      const modelName = 'gemini-1.5-flash';
      const result = await requestAiReview(base64Image);
      const detectedScore = result.score?.replace(/\D/g, '');

      if (detectedScore && detectedScore.length >= 1) {
        const evidenceCanvas = document.createElement('canvas');
        const evidenceWidth = getOptimalEvidenceWidth(isLowPerformance);
        evidenceCanvas.width = evidenceWidth;
        evidenceCanvas.height = evidenceWidth * (vh / vw);
        const evidenceCtx = evidenceCanvas.getContext('2d');
        evidenceCtx?.drawImage(video, 0, 0, evidenceCanvas.width, evidenceCanvas.height);

        const finalImage = compressCanvasImage(evidenceCanvas, isLowPerformance);

        onUpdateAiReview({
          score: detectedScore,
          condition: result.condition || 'Normal',
          notes: result.notes || '',
          image: finalImage
        });
        setScannerStatus('review');
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

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
          relatedTransactionId: draftTxId,
        });

        clearCanvasMemory(canvas);
      }
    } catch (e: any) {
      console.error('AI meter scan failed', e);
      alert(lang === 'zh' ? 'AI 不可用，已切换为手动拍照模式。' : 'AI unavailable, switching to manual photo mode.');
      takeManualPhoto();
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleConfirmAI = () => {
    if (aiReviewData) {
      onUpdateScore(aiReviewData.score);
      onUpdatePhoto(aiReviewData.image);
      stopScanner();
      alert(lang === 'zh' ? '✅ AI reading filled in, please verify' : '✅ AI reading filled in, please verify');
    }
  };

  const handleRetake = () => {
    onUpdateAiReview(null);
    setScannerStatus('scanning');
    scanIntervalRef.current = window.setInterval(captureAndAnalyze, 2000);
    isProcessingRef.current = false;
  };

  return (
    <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
      <WizardStepBar current="capture" lang={lang} />

      {/* Location sub-header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2.5 bg-white border border-slate-200 rounded-subcard text-slate-500 hover:text-indigo-600 shadow-field transition-colors flex-shrink-0">
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900 truncate leading-tight">{selectedLocation?.name}</h2>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em]">
            {selectedLocation?.machineId} • {((selectedLocation?.commissionRate ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Score input */}
      <div className="bg-white rounded-subcard border border-slate-200 p-5 shadow-field">
        <label className="text-[10px] font-black text-slate-400 uppercase block mb-3 tracking-widest">{t.currentReading}</label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={currentScore}
            onChange={e => onUpdateScore(e.target.value)}
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
          <div className={`mt-4 p-4 rounded-subcard text-white flex justify-between items-center ${revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            <div>
              <p className="text-[9px] font-black uppercase opacity-60">{t.diff} {diff}</p>
              <p className="text-[9px] font-black uppercase opacity-60">{diff} × 200 TZS</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black">TZS {revenue.toLocaleString()}</p>
              <p className="text-[8px] opacity-60 uppercase">{t.revenue}</p>
            </div>
          </div>
        )}

        {isScoreBelowLastReading && (
          <div className="mt-3 p-3 rounded-subcard border border-rose-200 bg-rose-50">
            <p className="text-[9px] font-black uppercase text-rose-600">
              {lang === 'zh'
                ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请先确认是否应提交重置申请。`
                : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Confirm whether this should be a reset request instead.`}
            </p>
          </div>
        )}
      </div>

      {/* GPS status — uses rich status from useGpsCapture */}
      {(() => {
        const isError = gpsHookStatus === 'denied' || gpsHookStatus === 'timeout' || gpsHookStatus === 'error';
        const isGranted = gpsHookStatus === 'granted' && !!gpsHookCoords;
        const isRequesting = gpsHookStatus === 'requesting' || gpsHookStatus === 'idle';
        const containerCls = isGranted
          ? 'bg-emerald-50 border-emerald-200'
          : isError
          ? 'bg-rose-50 border-rose-200'
          : 'bg-slate-50 border-slate-200';
        const iconCls = isGranted
          ? 'bg-emerald-500 text-white'
          : isError
          ? 'bg-rose-500 text-white'
          : 'bg-slate-400 text-white';
        const textCls = isGranted
          ? 'text-emerald-700'
          : isError
          ? 'text-rose-600'
          : 'text-slate-500';
        const label =
          gpsHookStatus === 'granted' && gpsHookCoords
            ? `GPS Locked (${gpsHookCoords.lat.toFixed(4)}, ${gpsHookCoords.lng.toFixed(4)})`
            : gpsHookStatus === 'denied'
            ? (lang === 'sw' ? 'GPS imekataliwa — angalia mipangilio ya kivinjari' : 'GPS denied — check browser settings')
            : gpsHookStatus === 'timeout'
            ? (lang === 'sw' ? 'GPS imechelewa — bonyeza kurudia' : 'GPS timed out — tap to retry')
            : gpsHookStatus === 'error'
            ? (lang === 'sw' ? 'GPS haipatikani — bonyeza kurudia' : 'GPS unavailable — tap to retry')
            : (lang === 'sw' ? 'Inapata GPS...' : 'Acquiring GPS...');
        return (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-subcard border ${containerCls}`}>
            <div className={`p-1.5 rounded-btn flex-shrink-0 ${iconCls}`}>
              {isRequesting
                ? <WifiOff size={13} className="animate-pulse" />
                : <Satellite size={13} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[9px] font-black uppercase ${textCls}`}>{label}</p>
            </div>
            {!isGranted && (
              <button onClick={requestGps} className="p-1.5 bg-white rounded-btn shadow-field text-indigo-600 flex-shrink-0">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        );
      })()}

      {/* Next button */}
      <button
        onClick={onNext}
        disabled={!currentScore || isScoreBelowLastReading}
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
                          onChange={e => onUpdateAiReview({...aiReviewData, score: e.target.value})}
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
                          onClick={() => onUpdateAiReview({...aiReviewData, condition: 'Normal'})}
                          className={`flex-1 py-2.5 rounded-subcard border flex flex-col items-center gap-1 transition-all ${aiReviewData.condition === 'Normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 text-slate-400'}`}
                        >
                          <CheckCircle2 size={16} />
                          <span className="text-[10px] font-black uppercase">Normal</span>
                        </button>
                        <button
                          onClick={() => onUpdateAiReview({...aiReviewData, condition: 'Damaged'})}
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
                        onChange={e => onUpdateAiReview({...aiReviewData, notes: e.target.value})}
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
};

export default ReadingCapture;

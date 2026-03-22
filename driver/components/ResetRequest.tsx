import React, { useRef, useState } from 'react';
import { ArrowRight, RefreshCw, Camera, CheckCircle2 } from 'lucide-react';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';
import { compressAndResizeImage } from '../../utils/imageUtils';
import { createResetRequestTransaction } from '../../utils/transactionBuilder';

interface ResetRequestProps {
  location: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  gpsCoords: { lat: number; lng: number } | null;
  onSubmit: (tx: Transaction) => void;
  onCancel: () => void;
}

const ResetRequest: React.FC<ResetRequestProps> = ({
  location, currentDriver, lang, gpsCoords, onSubmit, onCancel,
}) => {
  const t = TRANSLATIONS[lang];
  const [resetPhotoData, setResetPhotoData] = useState<string | null>(null);
  const resetFileRef = useRef<HTMLInputElement>(null);

  const handleResetPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBlob = await compressAndResizeImage(file);
        const reader = new FileReader();
        reader.readAsDataURL(compressedBlob);
        reader.onloadend = () => { setResetPhotoData(reader.result as string); };
      } catch (err) { console.error("Compression failed", err); }
    }
  };

  const handleSubmitResetRequest = () => {
    if (!resetPhotoData) {
      alert(lang === 'zh' ? '❌ 请拍照当前分数照片' : '❌ Photo of current score required!');
      return;
    }

    const notes = lang === 'zh' ? '9999爆机重置申请' : '9999 overflow reset request';
    const tx = createResetRequestTransaction(
      location,
      currentDriver,
      gpsCoords,
      resetPhotoData,
      notes
    );

    onSubmit(tx);
    alert(lang === 'zh' ? '✅ 重置申请已提交，等待老板审批' : '✅ Reset request submitted, awaiting approval');
  };

  return (
    <div className="max-w-md mx-auto py-6 px-4 animate-in fade-in">
      <div className="bg-white rounded-card p-6 border border-slate-200 shadow-field-md space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <button
            onClick={onCancel}
            className="p-2.5 bg-slate-100 rounded-subcard text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowRight size={18} className="rotate-180" />
          </button>
          <div className="text-center">
            <h2 className="text-base font-black text-slate-900">{t.resetRequest}</h2>
            <p className="text-[10px] font-black text-rose-500 uppercase mt-1">{location?.name} • {location?.machineId}</p>
          </div>
          <div className="w-10" />
        </div>

        <div className="bg-rose-50 p-4 rounded-subcard border border-rose-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500 rounded-btn text-white flex-shrink-0"><RefreshCw size={16} /></div>
            <div>
              <p className="text-xs font-black text-rose-800 uppercase">{t.resetRequestDesc}</p>
              <p className="text-[9px] font-bold text-rose-400 mt-0.5">
                {lang === 'zh' ? `当前分数: ${location?.lastScore}` : `Current score: ${location?.lastScore}`}
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
};

export default ResetRequest;

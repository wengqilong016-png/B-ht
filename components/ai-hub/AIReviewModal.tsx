import React from 'react';
import { ShieldCheck, X, Edit3, RotateCcw, Check } from 'lucide-react';

export interface PendingReviewData {
  reading: string;
  condition: string;
  summary: string;
  image: string;
  originalQuery: string;
  modelUsed: string;
  sources?: any[];
  isOCR: boolean;
}

interface AIReviewModalProps {
  pendingReview: PendingReviewData;
  onUpdate: (data: PendingReviewData) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const AIReviewModal: React.FC<AIReviewModalProps> = ({ pendingReview, onUpdate, onClose, onConfirm }) => (
  <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
    <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl text-white"><ShieldCheck size={20} /></div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">AI 结果确认 REVIEW</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Verify Analysis Results</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
        <div className="h-40 bg-black rounded-2xl overflow-hidden border-2 border-slate-100 relative group">
          <img src={pendingReview.image} className="w-full h-full object-contain" alt="Review" />
          <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-[9px] font-bold uppercase backdrop-blur-sm">Source Evidence</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">读数 Reading</label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <input
                type="text"
                value={pendingReview.reading}
                onChange={(e) => onUpdate({ ...pendingReview, reading: e.target.value })}
                className="bg-transparent w-full text-sm font-black text-slate-900 outline-none"
                placeholder="0000"
              />
              <Edit3 size={14} className="text-slate-400" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase ml-1">状态 Condition</label>
            <select
              value={pendingReview.condition}
              onChange={(e) => onUpdate({ ...pendingReview, condition: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none"
            >
              <option value="Normal">正常 Normal</option>
              <option value="Maintenance">需维护 Maintenance</option>
              <option value="Broken">故障 Broken</option>
              <option value="Unknown">未知 Unknown</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">分析摘要 Summary</label>
          <textarea
            value={pendingReview.summary}
            onChange={(e) => onUpdate({ ...pendingReview, summary: e.target.value })}
            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 outline-none resize-none leading-relaxed"
          />
        </div>
      </div>

      <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs hover:bg-slate-100 flex items-center justify-center gap-2">
          <RotateCcw size={14} /> 重试 Retake
        </button>
        <button onClick={onConfirm} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2">
          <Check size={16} /> 确认并归档 Confirm
        </button>
      </div>
    </div>
  </div>
);

export default AIReviewModal;

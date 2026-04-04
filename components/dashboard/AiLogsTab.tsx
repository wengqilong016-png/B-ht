import React, { useState } from 'react';
import { Search, ImageIcon, FileText, LayoutList, BrainCircuit } from 'lucide-react';
import { AILog, TRANSLATIONS } from '../../types';

interface AiLogsTabProps {
  filteredAiLogs: AILog[];
  aiLogSearch: string;
  setAiLogSearch: (v: string) => void;
  aiLogTypeFilter: 'all' | 'image' | 'text';
  setAiLogTypeFilter: (v: 'all' | 'image' | 'text') => void;
  lang: 'zh' | 'sw';
}

const AiLogsTab: React.FC<AiLogsTabProps> = ({
  filteredAiLogs,
  aiLogSearch,
  setAiLogSearch,
  aiLogTypeFilter,
  setAiLogTypeFilter,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [aiLogViewMode, setAiLogViewMode] = useState<'list' | 'grid'>('list');
  const [viewingLog, setViewingLog] = useState<AILog | null>(null);

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 flex-1 min-w-[160px]">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={aiLogSearch}
            onChange={e => setAiLogSearch(e.target.value)}
            placeholder={lang === 'zh' ? '搜索 AI 日志…' : 'Search AI logs...'}
            className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full placeholder:text-slate-400"
          />
        </div>
        {/* Type filter */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {(['all', 'image', 'text'] as const).map(f => (
            <button
              key={f}
              onClick={() => setAiLogTypeFilter(f)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${aiLogTypeFilter === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              {f === 'all' && <LayoutList size={11} />}
              {f === 'image' && <ImageIcon size={11} />}
              {f === 'text' && <FileText size={11} />}
              {f === 'all' ? (lang === 'zh' ? '全部' : 'All') : f === 'image' ? (lang === 'zh' ? '图片' : 'Image') : (lang === 'zh' ? '文本' : 'Text')}
            </button>
          ))}
        </div>
        {/* View mode */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setAiLogViewMode('list')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>LIST</button>
          <button onClick={() => setAiLogViewMode('grid')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>GRID</button>
        </div>
      </div>

      {/* Empty state */}
      {filteredAiLogs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <BrainCircuit size={48} className="text-slate-200" />
          <p className="text-sm font-black text-slate-400">{lang === 'zh' ? '暂无 AI 日志记录' : 'No AI logs yet'}</p>
          <p className="text-[10px] font-bold text-slate-300">{lang === 'zh' ? '后续 AI 使用记录会显示在这里' : 'New AI activity will appear here'}</p>
        </div>
      )}

      <div className={aiLogViewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-4 gap-4' : 'space-y-4'}>
        {filteredAiLogs.map(log => (
          <button key={log.id} className="bg-white p-3 rounded-[24px] border border-slate-200 cursor-pointer hover:shadow-md transition-shadow text-left w-full" onClick={() => setViewingLog(log)}>
            {log.imageUrl && <img src={log.imageUrl} className="w-full aspect-square object-cover rounded-2xl mb-2" alt="Log" />}
            <p className="text-[10px] font-black text-slate-900 truncate">{log.driverName}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(log.timestamp).toLocaleDateString()}</p>
          </button>
        ))}
      </div>

      {/* Log detail modal */}
      {viewingLog && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setViewingLog(null)}>
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <p className="text-sm font-black text-slate-900">{viewingLog.driverName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(viewingLog.timestamp).toLocaleString()}</p>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {viewingLog.imageUrl && (
                <img src={viewingLog.imageUrl} alt="Log" className="w-full rounded-2xl border border-slate-200" />
              )}
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{lang === 'zh' ? '输入' : 'Query'}</p>
                <p className="text-xs text-slate-700">{viewingLog.query}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{lang === 'zh' ? '输出' : 'Response'}</p>
                <p className="text-xs text-slate-700">{viewingLog.response}</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setViewingLog(null)} className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase">{t.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiLogsTab;

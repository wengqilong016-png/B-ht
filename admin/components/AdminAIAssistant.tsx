import {
  Bot, X, Send, Loader2, AlertTriangle, AlertCircle,
  Info, Trash2, ChevronRight, Sparkles, RefreshCw,
} from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';

import { useAppData } from '../../contexts/DataContext';
import { useAdminAI, type AdminAIAlert } from '../../hooks/useAdminAI';

const QUICK_PROMPTS = [
  '🔍 代理审核分析：今日所有未结算点位 + 异常交易汇总，并建议下一步行动',
  '今日运营状况总结',
  '哪些机器需要关注？',
  '本周营业额趋势如何？',
  '有哪些待处理事项？',
  '哪些机器无法删除？为什么？',
  '机器债务明细',
];

function AlertCard({ alert }: { alert: AdminAIAlert }) {
  const colors = {
    urgent: 'bg-rose-50 border-rose-200 text-rose-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    info: 'bg-amber-50 border-amber-200 text-amber-600',
  };
  const icons = {
    urgent: <AlertCircle size={14} className="flex-shrink-0 text-rose-500 mt-0.5" />,
    warning: <AlertTriangle size={14} className="flex-shrink-0 text-amber-500 mt-0.5" />,
    info: <Info size={14} className="flex-shrink-0 text-amber-400 mt-0.5" />,
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors[alert.level]}`}>
      <div className="flex items-start gap-2">
        {icons[alert.level]}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black leading-tight">{alert.title}</p>
          {alert.body && <p className="text-[10px] mt-0.5 opacity-80 leading-snug line-clamp-2">{alert.body}</p>}
          {alert.action && (
            <p className="text-[10px] font-bold mt-1 flex items-center gap-0.5 opacity-90">
              {alert.action} <ChevronRight size={10} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isAI = role === 'assistant';
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className={`flex ${isAI ? 'justify-start' : 'justify-end'} gap-2`}>
      {isAI && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center mt-0.5">
          <Bot size={12} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
        isAI ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
              : 'bg-amber-600 text-white rounded-tr-sm'
      }`}>
        {parts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
        )}
      </div>
    </div>
  );
}

interface AdminAIAssistantProps {
  lang: 'zh' | 'sw';
}

const AdminAIAssistant: React.FC<AdminAIAssistantProps> = ({ lang }) => {
  const { locations, drivers, transactions, dailySettlements } = useAppData();
  const { alerts, alertCount, messages, isLoading, sendMessage, clearHistory, snapshot } =
    useAdminAI(locations, drivers, transactions, dailySettlements);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<'alerts' | 'chat'>('alerts');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  useEffect(() => {
    if (isOpen && tab === 'chat') setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen, tab]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await sendMessage(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  const handleQuickPrompt = (prompt: string) => {
    setTab('chat');
    void sendMessage(prompt);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(v => !v)}
                type="button"
        aria-label={lang === 'zh' ? 'AI助手' : 'AI Assistant'}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-amber-600 text-white shadow-lg shadow-amber-200 flex items-center justify-center hover:bg-amber-700 active:scale-95 transition-all md:bottom-6"
      >
        {isOpen ? <X size={18} /> : <Bot size={20} />}
        {!isOpen && alertCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full text-caption font-black flex items-center justify-center border-2 border-white">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/40 pointer-events-auto md:hidden" onClick={() => setIsOpen(false)} />
          <div
            className="relative pointer-events-auto w-full md:w-[390px] md:mr-5 md:mb-8 flex flex-col bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: 'min(90vh, 680px)' }}
          >
            <div className="flex-shrink-0 bg-gradient-to-r from-amber-600 to-amber-700 px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">AI 运营助手</p>
                    <p className="text-caption text-amber-200 font-bold">Bahati Intelligence · {snapshot.today}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {tab === 'chat' && messages.length > 0 && (
                    <button type="button"
                      aria-label="Clear chat"
                      className="p-1.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/20 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5 bg-white/10 rounded-xl p-1">
                <button type="button"
                        aria-label='Alert reminders'
                        aria-pressed={tab === 'alerts'}
                        onClick={() => setTab('alerts')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-black uppercase transition-colors ${tab === 'alerts' ? 'bg-white text-amber-600 shadow-sm' : 'text-white/80 hover:bg-white/10'}`}
                      >
                  {alertCount > 0 ? `⚠️ 提醒 (${alertCount})` : '✓ 状态监控'}
                      </button>
                <button type="button"
                        aria-label='Chat with AI'
                        aria-pressed={tab === 'chat'}
                        onClick={() => setTab('chat')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-black uppercase transition-colors ${tab === 'chat' ? 'bg-white text-amber-600 shadow-sm' : 'text-white/80 hover:bg-white/10'}`}
                      >
                  💬 {messages.length > 0 ? `对话 (${messages.filter(m => m.role === 'assistant').length})` : 'AI 提问'}
                      </button>
              </div>
            </div>

            {tab === 'alerts' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200 text-center">
                    <p className="text-caption font-black text-slate-400 uppercase mb-0.5">今日收款</p>
                    <p className="text-lg font-black text-slate-800 leading-none">{snapshot.todayCollections}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-slate-200 text-center">
                    <p className="text-caption font-black text-slate-400 uppercase mb-0.5">今日营业额</p>
                    <p className="text-sm font-black text-amber-600 leading-none truncate">
                      {snapshot.todayRevenue >= 1000000 ? `${(snapshot.todayRevenue / 1000000).toFixed(1)}M` : `${(snapshot.todayRevenue / 1000).toFixed(0)}K`}
                    </p>
                  </div>
                  <div className={`rounded-xl p-2.5 border text-center ${snapshot.pendingSettlements > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                    <p className="text-caption font-black text-slate-400 uppercase mb-0.5">待审批</p>
                    <p className={`text-lg font-black leading-none ${snapshot.pendingSettlements > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{snapshot.pendingSettlements}</p>
                  </div>
                </div>

                {alerts.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-emerald-600 font-black text-sm">✓ 系统运行正常</p>
                    <p className="text-emerald-500 text-[10px] mt-1">{snapshot.recentTrend || '暂无待处理事项'}</p>
                  </div>
                ) : (
                  alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)
                )}

                {snapshot.recentTrend && (
                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <RefreshCw size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-600 leading-snug">{snapshot.recentTrend}</p>
                  </div>
                )}

                <div className="pt-1">
                  <p className="text-caption font-black text-slate-400 uppercase mb-2 flex items-center gap-1"><Sparkles size={10} /> 快捷提问</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_PROMPTS.map(q => (
                      <button key={q} type="button" onClick={() => handleQuickPrompt(q)}
                        className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-[10px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-colors text-left leading-snug">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 min-h-[200px]">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-6 gap-3">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <Bot size={22} className="text-amber-500" />
                      </div>
                      <p className="text-xs text-slate-500 text-center leading-relaxed">
                        你好！我是Bahati AI助手。<br />可以问我任何关于今日运营的问题。
                      </p>
                      <div className="w-full space-y-1.5">
                        {QUICK_PROMPTS.map(q => (
                          <button key={q} onClick={() => void sendMessage(q)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-600 transition-colors text-left">
                            {q} →
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)
                  )}
                  {isLoading && (
                    <div className="flex justify-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center flex-shrink-0">
                        <Bot size={12} className="text-white" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin text-amber-400" />
                        <span className="text-[10px] text-slate-400">思考中…</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex-shrink-0 border-t border-slate-100 bg-white px-3 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="输入问题…"
                      disabled={isLoading}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all disabled:opacity-60" />
                    <button type="button"
                      aria-label="Send message"
                      aria-disabled={!input.trim() || isLoading}
                      onClick={() => { handleSend() }}
                      className="p-2 rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400 transition-colors"
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminAIAssistant;
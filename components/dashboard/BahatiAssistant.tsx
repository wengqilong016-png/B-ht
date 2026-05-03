import {
  MessageCircle, Send, Phone, Users, MapPin,
  AlertTriangle, TrendingUp, Search, Sparkles,
} from 'lucide-react';
import React, { useRef, useEffect, useState } from 'react';

import { useAdminAI } from '../../hooks/useAdminAI';
import { useAppData } from '../../contexts/DataContext';

interface BahatiAssistantProps {
  lang: 'zh' | 'sw';
}

const PRESET_PROMPTS_ZH = [
  { label: '📊 今日概况', text: '总结今天所有司机的收款情况，包括总收入、异常点、失联司机' },
  { label: '🔍 查司机', text: '列出每个司机今天的收款笔数和金额' },
  { label: '🚨 异常检测', text: '检查是否有分数异常的交易，列出详情' },
  { label: '💰 营收分析', text: '分析本周收入趋势，对比上周' },
];

const PRESET_PROMPTS_EN = [
  { label: '📊 Today Overview', text: 'Summarize all driver collections today including revenue, anomalies, stale drivers' },
  { label: '🔍 Driver Stats', text: 'List each driver with their collection count and amount today' },
  { label: '🚨 Anomalies', text: 'Check for suspicious score transactions with details' },
  { label: '💰 Revenue', text: 'Analyze this week revenue trend vs last week' },
];

const BahatiAssistant: React.FC<BahatiAssistantProps> = ({ lang }) => {
  const { locations, drivers, transactions, dailySettlements } = useAppData();
  const { alerts, messages, isLoading, sendMessage } = useAdminAI(locations, drivers, transactions, dailySettlements);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const t = lang === 'zh';

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;
    setInput('');
    await sendMessage(msg);
  };

  // SMS bulk send — use device native SMS app
  const handleSmsBroadcast = () => {
    const phones = drivers
      .filter(d => d.phone)
      .map(d => d.phone)
      .filter(Boolean);
    if (phones.length === 0) return;
    const body = encodeURIComponent(t ? 'Habari, tafadhali wasilisha ripoti ya leo.' : 'Hello, please submit today\'s report.');
    window.open(`sms:${phones.join(',')}?body=${body}`, '_self');
  };

  // Quick stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxs = transactions.filter(tx => tx.timestamp?.startsWith(todayStr));
  const todayRevenue = todayTxs.reduce((s, tx) => s + (tx.revenue ?? 0), 0);
  const onlineDrivers = drivers.filter(d => d.status === 'active').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-amber-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <Sparkles size={18} className="text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-black text-slate-900">
              {t ? '小 Bahati 助手' : 'Bahati Assistant'}
            </p>
            <p className="text-caption font-bold text-slate-400">
              {t ? '智能分析 · 群发短信 · 问答' : 'AI · SMS · Q&A'}
            </p>
          </div>
        </div>
        {alerts.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-caption font-black">
            {alerts.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-3 gap-2 p-4 pb-2">
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="text-caption font-black text-slate-400">{t ? '今日收款' : 'Today'}</p>
              <p className="text-sm font-black text-slate-900 mt-0.5">{todayTxs.length}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5 text-center">
              <p className="text-caption font-black text-amber-500">{t ? '今日收入' : 'Revenue'}</p>
              <p className="text-sm font-black text-amber-700 mt-0.5">TZS {todayRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
              <p className="text-caption font-black text-emerald-500">{t ? '在线司机' : 'Online'}</p>
              <p className="text-sm font-black text-emerald-700 mt-0.5">{onlineDrivers}/{drivers.length}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 px-4 pb-3">
            <button
              onClick={handleSmsBroadcast}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-black text-caption hover:bg-blue-100 transition-colors"
            >
              <Phone size={13} />
              {t ? '群发短信' : 'SMS All'}
            </button>
            <button
              onClick={() => handleSend(t ? '总结今天所有司机工作情况' : 'Summarize all driver work today')}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 font-black text-caption hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <TrendingUp size={13} />
              {t ? '快速总结' : 'Quick Summary'}
            </button>
          </div>

          {/* Preset Prompts */}
          <div className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {(t ? PRESET_PROMPTS_ZH : PRESET_PROMPTS_EN).map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p.text)}
                  disabled={isLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-caption font-bold hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          {messages.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 max-h-64 overflow-y-auto space-y-2.5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                    m.role === 'user'
                      ? 'bg-amber-600 text-white rounded-br-sm'
                      : 'bg-slate-50 text-slate-700 rounded-bl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-xs text-slate-400">
                    {t ? '思考中...' : 'Thinking...'}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-t border-slate-100">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={t ? '问 Bahati 任何问题...' : 'Ask Bahati anything...'}
              disabled={isLoading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber-300 disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BahatiAssistant;

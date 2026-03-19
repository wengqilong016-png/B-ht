import React from 'react';
import { User, Bot, Volume2, ShieldCheck, Globe, Activity, Loader2 } from 'lucide-react';
import { TtsConfig } from './AIConfigPanel';

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  image?: string;
  sources?: any[];
  isThinking?: boolean;
}

interface AIChatMessagesProps {
  chat: ChatMessage[];
  loading: boolean;
  useOCR: boolean;
  useDeepThink: boolean;
  ttsConfig: TtsConfig;
  playTTS: (text: string) => void;
}

const AIChatMessages: React.FC<AIChatMessagesProps> = ({ chat, loading, useOCR, useDeepThink, ttsConfig, playTTS }) => (
  <div className="flex-1 overflow-y-auto p-6 space-y-6">
    {chat.length === 0 && (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="w-20 h-20 bg-indigo-50 rounded-[35px] flex items-center justify-center text-indigo-300">
          <Activity size={40} className="animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">等待审计输入</p>
          <p className="text-xs text-slate-300 mt-2 max-w-xs mx-auto">
            您可以发送机器照片进行自动巡检，或关联一笔历史交易请求 AI 进行深度风控分析。
          </p>
        </div>
      </div>
    )}
    {chat.map((msg, i) => (
      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'flex flex-col items-end' : ''}`}>
          <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${msg.role === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-slate-900 text-white'}`}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              {msg.role === 'user' ? 'FIELD OPS' : msg.isThinking ? 'Visual Auditor (Deep)' : 'Visual Auditor'}
            </span>
          </div>

          {msg.image && (
            <div className="mb-2 w-48 h-32 rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm">
              <img src={msg.image} className="w-full h-full object-cover" alt="User upload" />
            </div>
          )}

          <div className={`p-5 rounded-3xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-50 border border-slate-200 text-slate-900 rounded-tl-none'}`}>
            <div className="whitespace-pre-wrap">{msg.content}</div>

            {msg.role === 'bot' && (
              <div className="mt-4 flex items-center gap-3 border-t border-slate-200/50 pt-3">
                <button onClick={() => playTTS(msg.content)} className="flex items-center gap-1.5 text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition-colors">
                  <Volume2 size={12} /> {ttsConfig.lang === 'zh' ? 'Play' : ttsConfig.lang === 'sw' ? 'Play' : 'Play'}
                </button>
                <div className="flex-1"></div>
                <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase">
                  <ShieldCheck size={10} /> 结果已存档
                </div>
              </div>
            )}
          </div>

          {msg.sources && (
            <div className="flex flex-wrap gap-2 mt-2">
              {msg.sources.map((s: any, idx: number) => s.web && (
                <a key={idx} href={s.web.uri} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[9px] font-bold text-emerald-700">
                  <Globe size={10} /> 研判来源: {s.web.title || '市场数据'}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    ))}
    {loading && (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase">
          <Loader2 size={14} className="animate-spin" /> {useOCR ? '正在进行高精度数字识别...' : (useDeepThink ? '正在提取视觉特征并对比历史逻辑链条...' : '正在进行快速视觉识别与健康度判定...')}
        </div>
      </div>
    )}
  </div>
);

export default AIChatMessages;

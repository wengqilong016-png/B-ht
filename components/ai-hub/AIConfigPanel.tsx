import React from 'react';
import { BrainCircuit, Volume2, ScanLine, Brain, Languages, Mic } from 'lucide-react';

export interface TtsConfig {
  lang: string;
  voice: string;
}

interface AIConfigPanelProps {
  useOCR: boolean;
  setUseOCR: (v: boolean) => void;
  useDeepThink: boolean;
  setUseDeepThink: (v: boolean) => void;
  ttsConfig: TtsConfig;
  setTtsConfig: (c: TtsConfig) => void;
}

const AIConfigPanel: React.FC<AIConfigPanelProps> = ({
  useOCR, setUseOCR, useDeepThink, setUseDeepThink, ttsConfig, setTtsConfig
}) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="space-y-2">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><BrainCircuit size={12} /> 识别模式 Analysis Mode</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setUseOCR(false); setUseDeepThink(false); }}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${!useOCR && !useDeepThink ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`}
        >
          标准 Standard
        </button>
        <button
          onClick={() => { setUseOCR(true); setUseDeepThink(false); }}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center gap-1 ${useOCR ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`}
        >
          <ScanLine size={12} /> OCR Mode
        </button>
        <button
          onClick={() => { setUseDeepThink(true); setUseOCR(false); }}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center gap-1 ${useDeepThink && !useOCR ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`}
        >
          <Brain size={12} /> Deep Think
        </button>
      </div>
    </div>

    <div className="space-y-2">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Volume2 size={12} /> 语音配置 Voice & Language</p>
      <div className="flex gap-2">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 flex-1">
          <Languages size={14} className="text-slate-400" />
          <select
            value={ttsConfig.lang}
            onChange={(e) => setTtsConfig({ ...ttsConfig, lang: e.target.value })}
            className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full"
          >
            <option value="zh">中文 (Chinese)</option>
            <option value="sw">Swahili</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 flex-1">
          <Mic size={14} className="text-slate-400" />
          <select
            value={ttsConfig.voice}
            onChange={(e) => setTtsConfig({ ...ttsConfig, voice: e.target.value })}
            className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full"
          >
            <option value="Kore">Kore (Female)</option>
            <option value="Puck">Puck (Male)</option>
            <option value="Fenrir">Fenrir (Deep)</option>
            <option value="Charon">Charon (Deep)</option>
            <option value="Aoede">Aoede (Soft)</option>
          </select>
        </div>
      </div>
    </div>
  </div>
);

export default AIConfigPanel;

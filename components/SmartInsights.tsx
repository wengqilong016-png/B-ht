import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Sparkles, RefreshCw, AlertCircle, MapPin } from 'lucide-react';
import { Transaction, Location } from '../types';

interface SmartInsightsProps {
  transactions: Transaction[];
  locations: Location[];
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ transactions, locations }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);

  const generateInsight = async () => {
    setLoading(true);
    setSources([]);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      let lat = -6.82; 
      let lng = 39.25;
      
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (e) {
        console.warn("Geolocation failed for insights, using default.");
      }

      const prompt = `
        你是一个专业的坦桑尼亚自动售货机运营专家。请基于以下数据为老板提供中文分析报告。
        点位状态: ${JSON.stringify(locations.map(l => ({ 点位: l.name, 当前计数: l.lastScore, 坐标: l.coords })))}
        近期营收: ${JSON.stringify(transactions.slice(0, 5).map(t => ({ 点位: t.locationName, 收入: t.revenue })))}
        
        要求：
        1. 使用中文书写。
        2. 提供两句简洁的业务表现总结。
        3. 利用 Google Maps 工具搜索当前 Dar es Salaam 区域最近的人流密集区或商业中心，给出一个具体的“搬迁建议位置”。
        4. 语气专业。
      `;

      // Google Maps tool is only supported on Gemini 2.5 series models.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude: lat, longitude: lng }
            }
          }
        }
      });

      setInsight(response.text || "数据稳定，请继续保持日常巡检。");
      
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const mapsSources = chunks
          .filter(c => c.maps)
          .map(c => ({ title: c.maps?.title || 'Map Location', uri: c.maps?.uri }));
        setSources(mapsSources);
      }
    } catch (err) {
      console.error("AI Insight error:", err);
      setInsight("暂时无法生成 AI 报告，请检查网络或 API 配置。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (transactions.length > 0) {
      generateInsight();
    }
  }, [transactions.length]);

  return (
    <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 text-white shadow-2xl mb-8 relative overflow-hidden border border-white/10">
      <div className="absolute -top-12 -right-12 p-8 opacity-10 rotate-12">
        <Sparkles size={200} />
      </div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col">
            <h3 className="font-black text-sm uppercase tracking-[0.2em] flex items-center gap-2 text-indigo-200">
              <Sparkles size={18} className="text-indigo-400" />
              AI 智能运营助手 (地图感知版)
            </h3>
            {sources.length > 0 && (
              <span className="text-[8px] font-bold text-emerald-400 uppercase mt-1">已结合实时地理位置数据分析</span>
            )}
          </div>
          <button 
            onClick={generateInsight}
            disabled={loading}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors backdrop-blur-md"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-400' : 'text-slate-400'} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 w-3/4 bg-white/10 rounded-full"></div>
            <div className="h-3 w-1/2 bg-white/10 rounded-full"></div>
          </div>
        ) : insight ? (
          <div className="space-y-4">
            <p className="text-sm font-bold leading-relaxed text-indigo-50/90 tracking-wide">
              {insight}
            </p>
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {sources.map((s, i) => (
                  <a 
                    key={i} 
                    href={s.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/5 rounded-full text-[9px] font-black uppercase transition-colors"
                  >
                    <MapPin size={10} className="text-rose-400" />
                    {s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-indigo-300/50 text-xs font-bold uppercase tracking-widest">
            <AlertCircle size={14} />
            等待数据以解锁 AI 洞察...
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartInsights;
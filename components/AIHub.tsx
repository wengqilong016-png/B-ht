
import React, { useState, useRef, useMemo } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { BrainCircuit, Send, Loader2, User, Bot, Sparkles, AlertCircle, Volume2, Search, Brain, Globe, Camera, X, ImageIcon, ShieldCheck, Activity, ScanLine, Link } from 'lucide-react';
import { Driver, Location, Transaction, User as UserType, AILog } from '../types';

interface AIHubProps {
  drivers: Driver[];
  locations: Location[];
  transactions: Transaction[];
  onLogAI: (log: AILog) => void;
  currentUser: UserType;
}

const AIHub: React.FC<AIHubProps> = ({ drivers, locations, transactions, onLogAI, currentUser }) => {
  const [query, setQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [chat, setChat] = useState<{role: 'user' | 'bot', content: string, image?: string, sources?: any[], isThinking?: boolean}[]>([]);
  const [loading, setLoading] = useState(false);
  const [useDeepThink, setUseDeepThink] = useState(false);
  const [useOCR, setUseOCR] = useState(false);
  const [selectedContextId, setSelectedContextId] = useState<string>(''); // For linking a transaction
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recent transactions for context linking
  const recentTransactions = useMemo(() => transactions.slice(0, 10), [transactions]);

  const decodeBase64 = (base64: string) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (e) {
      console.error("Base64 decode error", e);
      return new Uint8Array(0);
    }
  };

  const playTTS = async (text: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `用亲切专业的中文播报以下业务内容：${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const pcmData = decodeBase64(audioData);
        const safeByteLength = pcmData.byteLength - (pcmData.byteLength % 2);
        const dataInt16 = new Int16Array(pcmData.buffer, 0, safeByteLength / 2);
        
        const buffer = audioContextRef.current.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0;
        }
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start();
      }
    } catch (e) { 
      console.error("TTS failed", e); 
    }
  };

  // Optimization: Resize image before setting state to reduce payload size
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
           const canvas = document.createElement('canvas');
           const MAX_WIDTH = 800; // 800px is enough for analysis but faster than full resolution
           const scale = Math.min(1, MAX_WIDTH / img.width);
           canvas.width = img.width * scale;
           canvas.height = img.height * scale;
           const ctx = canvas.getContext('2d');
           ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
           setSelectedImage(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAskText = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!query.trim() && !selectedImage) || loading) return;
    
    const userMsg = query;
    const userImg = selectedImage;
    setQuery('');
    setSelectedImage(null);
    
    // Context linking
    const linkedTx = selectedContextId ? transactions.find(t => t.id === selectedContextId) : null;
    const linkedTxInfo = linkedTx ? `
      [Linked Transaction Context]:
      Location: ${linkedTx.locationName}
      Amount: ${linkedTx.netPayable}
      Date: ${linkedTx.timestamp}
    ` : '';
    
    // Determine initial display text
    let displayContent = userMsg;
    if (!displayContent) {
      if (useOCR) displayContent = "读取计数器 (OCR Read)";
      else if (userImg) displayContent = "分析此照片";
    }

    setChat(prev => [...prev, { role: 'user', content: displayContent || "Request", image: userImg || undefined }]);
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Use Pro model for OCR if selected for better accuracy, otherwise respect deep think toggle
      const modelName = useOCR ? 'gemini-3-pro-preview' : (useDeepThink ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview');
      
      const parts: any[] = [];
      if (userImg) {
        parts.push({
          inlineData: {
            data: userImg.split(',')[1],
            mimeType: 'image/jpeg'
          }
        });
      }
      
      let finalPrompt = userMsg;
      if (useOCR) {
         finalPrompt = `[OCR TASK] Strictly identify the numeric reading on the machine counter in this image.
         - Focus on 7-segment red LED displays or mechanical rolling counters.
         - Ignore serial numbers, phone numbers, or stickers.
         - Return ONLY the numeric value (e.g., '12345'). 
         ${userMsg ? `Additional Context: ${userMsg}` : ''}`;
      } else if (!userMsg) {
         finalPrompt = "请分析这张照片并结合现有业务数据提供建议。";
      }
      
      if (linkedTxInfo) {
        finalPrompt += `\n\n${linkedTxInfo}`;
      }

      parts.push({ text: finalPrompt || "Analyze" });

      const systemInstruction = useOCR 
        ? "You are a precision OCR engine for industrial equipment. Your sole purpose is to extract the main counter reading. Output digits only."
        : `你是 SmartKiosk 首席视觉审计顾问。
          
          业务背景：
          - 现有数据：${locations.length}个点位。
          - 历史点位详情: ${JSON.stringify(locations.map(l => ({ id: l.machineId, name: l.name, lastScore: l.lastScore, area: l.area })))}
          - 硬币面值: 1 coin = 200 TZS。

          任务要求 (特别是当用户上传照片时)：
          1. 识别图片中的机器 ID (如 M-001) 和当前计数器读数。
          2. 对比历史数据计算读数变化率。
          3. 评估照片清晰度及机器物理状态 (检查是否有凹痕、裂缝、生锈或人为破坏)。
          4. 判定机器当前状态等级：
             - [正常/NORMAL]: 运行良好，无损坏。
             - [低电量/LOW BATTERY]: 如果屏幕暗淡或有特定指示。
             - [需维修/MAINTENANCE]: 读数异常、物理损坏或环境极差。
          5. 给出具体的经营或维护建议。
          
          回答风格：专业、精炼、战略性。使用中文。`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: { 
          thinkingConfig: (useDeepThink && !useOCR) ? { thinkingBudget: 32768 } : undefined,
          tools: useOCR ? undefined : [{ googleSearch: {} }],
          systemInstruction: systemInstruction
        }
      });
      
      const botMsg = response.text || (useOCR ? "无法识别读数" : "抱歉，分析链路暂时无法提供反馈。");
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      setChat(prev => [...prev, { 
        role: 'bot', 
        content: botMsg, 
        sources: sources,
        isThinking: useDeepThink && !useOCR
      }]);

      // Create log entry
      const newLog: AILog = {
        id: `LOG-${Date.now()}`,
        timestamp: new Date().toISOString(),
        driverId: currentUser.id,
        driverName: currentUser.name,
        query: useOCR ? `[OCR] ${userMsg || 'Auto-Read'}` : (userMsg || "Image Analysis"),
        imageUrl: userImg || undefined,
        response: botMsg,
        modelUsed: modelName,
        relatedTransactionId: selectedContextId || undefined,
        relatedLocationId: linkedTx?.locationId || undefined
      };
      onLogAI(newLog);
      
      // Reset context after query
      setSelectedContextId('');

    } catch (err) {
      console.error("AI Hub Error:", err);
      setChat(prev => [...prev, { role: 'bot', content: "系统分析链路中断，请检查 API 配置或网络环境。" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-slate-100 bg-slate-50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 rounded-2xl text-white shadow-lg"><BrainCircuit size={24} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900">AI 视觉审计中心</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visual Audit & Strategy Console</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setUseOCR(!useOCR); if(!useOCR) setUseDeepThink(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${useOCR ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400'}`}
            >
              <ScanLine size={14} /> {useOCR ? 'OCR ON' : 'OCR Mode'}
            </button>
            
            {!useOCR && (
              <button 
                onClick={() => setUseDeepThink(!useDeepThink)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${useDeepThink ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                <Brain size={14} /> {useDeepThink ? 'Deep Think' : 'Standard'}
              </button>
            )}
          </div>
        </div>

        {/* Context Selector */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-full max-w-full overflow-x-auto">
           <Link size={14} className="text-slate-400 flex-shrink-0" />
           <select 
             value={selectedContextId} 
             onChange={(e) => setSelectedContextId(e.target.value)}
             className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full uppercase"
           >
             <option value="">关联特定交易 (Optional Context Link)</option>
             {recentTransactions.map(tx => (
               <option key={tx.id} value={tx.id}>
                 {tx.locationName} - {new Date(tx.timestamp).toLocaleTimeString()}
               </option>
             ))}
           </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {chat.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-20 h-20 bg-indigo-50 rounded-[35px] flex items-center justify-center text-indigo-300">
              <Activity size={40} className="animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">等待审计输入</p>
              <p className="text-xs text-slate-300 mt-2 max-w-xs mx-auto">
                您可以发送机器照片进行自动巡检，或询问：“哪几个点位最近营收下滑最严重？”
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
                     <button onClick={() => playTTS(msg.content)} className="flex items-center gap-1.5 text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800">
                       <Volume2 size={12} /> 播放审计语音
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

      <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
        {selectedImage && (
          <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-lg">
              <img src={selectedImage} className="w-full h-full object-cover" alt="Preview" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-0 right-0 p-0.5 bg-indigo-600 text-white rounded-bl-lg"
              >
                <X size={10} />
              </button>
            </div>
            <div className="text-[10px] font-black text-indigo-600 uppercase">图像已就绪，等待提交分析...</div>
          </div>
        )}

        <form onSubmit={handleAskText} className="relative flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-90"
          >
            <Camera size={20} />
          </button>
          
          <div className="flex-1 relative">
            <input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              type="text" 
              placeholder={selectedImage ? (useOCR ? "准备进行 OCR 识别..." : "为此照片添加描述或直接提交...") : "发送照片或输入分析指令..."} 
              className="w-full bg-white border border-slate-200 rounded-[22px] py-4 pl-6 pr-14 text-sm font-bold shadow-inner focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" 
            />
            <button 
              type="submit"
              disabled={loading || (!query.trim() && !selectedImage)} 
              className="absolute right-2 top-2 bottom-2 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-xl active:scale-90 transition-all disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AIHub;


import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { BrainCircuit, Send, Loader2, User, Bot, Sparkles, AlertCircle, Volume2, Search, Brain, Globe, Camera, X, ImageIcon, ShieldCheck, Activity, ScanLine, Link, Palette, Download, Wand2, Settings, Languages, Mic, Check, Edit3, AlertTriangle, RotateCcw } from 'lucide-react';
import { Driver, Location, Transaction, User as UserType, AILog } from '../types';

interface AIHubProps {
  drivers: Driver[];
  locations: Location[];
  transactions: Transaction[];
  onLogAI: (log: AILog) => void;
  currentUser: UserType;
  initialContextId?: string;
  onClearContext?: () => void;
}

interface PendingReviewData {
  reading: string;
  condition: string;
  summary: string;
  image: string;
  originalQuery: string;
  modelUsed: string;
  sources?: any[];
  isOCR: boolean;
}

const AIHub: React.FC<AIHubProps> = ({ drivers, locations, transactions, onLogAI, currentUser, initialContextId, onClearContext }) => {
  const [mode, setMode] = useState<'audit' | 'design'>('audit');
  
  // Audit Configuration State
  const [showConfig, setShowConfig] = useState(false);
  const [ttsConfig, setTtsConfig] = useState({ lang: 'zh', voice: 'Kore' }); // Voices: Kore, Puck, Fenrir, Charon
  const [useDeepThink, setUseDeepThink] = useState(false);
  const [useOCR, setUseOCR] = useState(false);

  // Audit Interaction State
  const [query, setQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [chat, setChat] = useState<{role: 'user' | 'bot', content: string, image?: string, sources?: any[], isThinking?: boolean}[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContextId, setSelectedContextId] = useState<string>('');
  
  // Review State
  const [pendingReview, setPendingReview] = useState<PendingReviewData | null>(null);
  
  // Design State
  const [imagePrompt, setImagePrompt] = useState('App Icon for "Bahati Jackpots": A cool majestic lion wearing sunglasses and a gold crown, surrounded by casino chips, slot machine 7s, vibrant safari sunset background, 3D glossy game art style, rounded square.');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial context if provided
  useEffect(() => {
    if (initialContextId) {
      setSelectedContextId(initialContextId);
      if(onClearContext) onClearContext();
    }
  }, [initialContextId]);

  // Context options - ensure selected one is available even if old
  const contextOptions = useMemo(() => {
    const list = transactions.slice(0, 10);
    if (selectedContextId && !list.find(t => t.id === selectedContextId)) {
        const selected = transactions.find(t => t.id === selectedContextId);
        if (selected) list.unshift(selected);
    }
    return list;
  }, [transactions, selectedContextId]);

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

      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      let promptPrefix = '';
      switch (ttsConfig.lang) {
          case 'sw': promptPrefix = 'Soma maandishi haya kwa Kiswahili cha asili na lafudhi nzuri: '; break;
          case 'en': promptPrefix = 'Read this text in a professional English voice: '; break;
          case 'zh': default: promptPrefix = '用亲切专业的中文播报以下业务内容：'; break;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `${promptPrefix}${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ttsConfig.voice } } }
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
           const MAX_WIDTH = 800;
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

  const handleGenerateImage = async () => {
    if (!imagePrompt || isGeneratingImg) return;
    setIsGeneratingImg(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: imagePrompt }],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          setGeneratedImage(`data:image/png;base64,${base64EncodeString}`);
          
          // Log the generation
          onLogAI({
            id: `GEN-${Date.now()}`,
            timestamp: new Date().toISOString(),
            driverId: currentUser.id,
            driverName: currentUser.name,
            query: `[Image Gen] ${imagePrompt}`,
            response: "Image Generated Successfully",
            modelUsed: "gemini-2.5-flash-image",
            imageUrl: `data:image/png;base64,${base64EncodeString}` // Store full image might be heavy, typically store link
          });
          break;
        }
      }
    } catch (err) {
      console.error("Image Gen Error", err);
      alert("图片生成失败，请稍后重试");
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const handleConfirmReview = () => {
    if (!pendingReview) return;

    // Construct final user query message
    const userDisplayMsg = pendingReview.isOCR 
        ? "OCR 读数识别请求" 
        : (pendingReview.originalQuery || "图像分析请求");

    setChat(prev => [...prev, { 
        role: 'user', 
        content: userDisplayMsg, 
        image: pendingReview.image 
    }]);

    // Construct structured bot response
    let botResponse = pendingReview.summary;
    if (pendingReview.isOCR || pendingReview.reading) {
        botResponse = `[CONFIRMED AUDIT]\nReading: ${pendingReview.reading}\nCondition: ${pendingReview.condition}\n\nAnalysis:\n${pendingReview.summary}`;
    }

    const linkedTx = selectedContextId ? transactions.find(t => t.id === selectedContextId) : null;

    setChat(prev => [...prev, { 
      role: 'bot', 
      content: botResponse, 
      sources: pendingReview.sources,
      isThinking: false
    }]);

    // Log the confirmed data
    const newLog: AILog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      driverId: currentUser.id,
      driverName: currentUser.name,
      query: pendingReview.isOCR ? `[OCR-CONFIRMED] ${pendingReview.originalQuery || 'Auto-Read'}` : (pendingReview.originalQuery || "Image Analysis"),
      imageUrl: pendingReview.image,
      response: botResponse,
      modelUsed: pendingReview.modelUsed,
      relatedTransactionId: selectedContextId || undefined,
      relatedLocationId: linkedTx?.locationId || undefined,
      isSynced: false
    };
    onLogAI(newLog);

    // Clean up
    setPendingReview(null);
    setQuery('');
    setSelectedImage(null);
    setSelectedContextId('');
  };

  const handleAskText = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!query.trim() && !selectedImage) || loading) return;
    
    const userMsg = query;
    const userImg = selectedImage;
    
    setShowConfig(false); // Auto close config on send
    setLoading(true);

    const linkedTx = selectedContextId ? transactions.find(t => t.id === selectedContextId) : null;
    const linkedTxInfo = linkedTx ? `
      [Linked Transaction Context]:
      Location: ${linkedTx.locationName}
      Amount: ${linkedTx.netPayable}
      Date: ${linkedTx.timestamp}
    ` : '';

    const modelName = useOCR ? 'gemini-3-pro-preview' : (useDeepThink ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview');

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
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
         finalPrompt = `[OCR TASK] Identify the numeric reading on the machine counter. Also assess the condition.
         Context: ${userMsg || 'No extra context'}`;
      } else if (!userMsg) {
         finalPrompt = "请分析这张照片并结合现有业务数据提供建议。";
      }
      
      if (linkedTxInfo) {
        finalPrompt += `\n\n${linkedTxInfo}`;
      }

      parts.push({ text: finalPrompt || "Analyze" });

      // Define Schema for Structured OCR
      const ocrSchema = {
        type: Type.OBJECT,
        properties: {
          reading: { type: Type.STRING, description: "The numeric counter reading" },
          condition: { type: Type.STRING, enum: ["Normal", "Maintenance", "Broken", "Unknown"], description: "Physical condition of the machine" },
          summary: { type: Type.STRING, description: "Brief analysis or observations" }
        },
        required: ["reading", "condition", "summary"]
      };

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: { 
          thinkingConfig: (useDeepThink && !useOCR) ? { thinkingBudget: 32768 } : undefined,
          tools: useOCR ? undefined : [{ googleSearch: {} }],
          responseMimeType: useOCR ? 'application/json' : undefined,
          responseSchema: useOCR ? ocrSchema : undefined,
          systemInstruction: useOCR 
            ? "You are a precision OCR engine. Extract the main red LED counter reading. Be precise."
            : `你是 SmartKiosk 首席视觉审计顾问。
              业务背景：
              - 现有数据：${locations.length}个点位。
              - 历史点位详情: ${JSON.stringify(locations.map(l => ({ id: l.machineId, name: l.name, lastScore: l.lastScore, area: l.area })))}
              - 硬币面值: 1 coin = 200 TZS。
              回答风格：专业、精炼、战略性。使用中文。`
        }
      });
      
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      let resultText = response.text || "";
      
      // If image is present (OCR or General Analysis), go to Review Mode
      if (userImg) {
          let parsedData = { reading: '', condition: 'Normal', summary: resultText };
          
          if (useOCR) {
              try {
                  const json = JSON.parse(resultText);
                  parsedData = {
                      reading: json.reading || '',
                      condition: json.condition || 'Normal',
                      summary: json.summary || ''
                  };
              } catch (e) {
                  console.error("JSON Parse Error", e);
                  parsedData.summary = resultText; // Fallback
              }
          }

          setPendingReview({
              reading: parsedData.reading,
              condition: parsedData.condition,
              summary: parsedData.summary,
              image: userImg,
              originalQuery: userMsg,
              modelUsed: modelName,
              sources: sources,
              isOCR: useOCR
          });
      } else {
          // Text-only chat, no review needed
          setChat(prev => [...prev, { role: 'user', content: userMsg }]);
          setChat(prev => [...prev, { role: 'bot', content: resultText, sources: sources }]);
          
          onLogAI({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            driverId: currentUser.id,
            driverName: currentUser.name,
            query: userMsg,
            response: resultText,
            modelUsed: modelName,
            relatedTransactionId: selectedContextId || undefined,
            isSynced: false
          });
          setQuery('');
      }

    } catch (err) {
      console.error("AI Hub Error:", err);
      setChat(prev => [...prev, { role: 'bot', content: "抱歉，分析链路中断，请重试。" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-2xl transition-all relative">
      {/* Review Modal Overlay */}
      {pendingReview && (
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
                 <button onClick={() => setPendingReview(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={18} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                 {/* Image Preview */}
                 <div className="h-40 bg-black rounded-2xl overflow-hidden border-2 border-slate-100 relative group">
                    <img src={pendingReview.image} className="w-full h-full object-contain" alt="Review" />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-[9px] font-bold uppercase backdrop-blur-sm">Source Evidence</div>
                 </div>

                 {/* Editable Fields */}
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-1">读数 Reading</label>
                       <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                          <input 
                            type="text" 
                            value={pendingReview.reading} 
                            onChange={(e) => setPendingReview({...pendingReview, reading: e.target.value})}
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
                         onChange={(e) => setPendingReview({...pendingReview, condition: e.target.value})}
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
                      onChange={(e) => setPendingReview({...pendingReview, summary: e.target.value})}
                      className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 outline-none resize-none leading-relaxed"
                    />
                 </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                 <button onClick={() => setPendingReview(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs hover:bg-slate-100 flex items-center justify-center gap-2">
                    <RotateCcw size={14} /> 重试 Retake
                 </button>
                 <button onClick={handleConfirmReview} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Check size={16} /> 确认并归档 Confirm
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="p-6 border-b border-slate-100 bg-slate-50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl text-white shadow-lg transition-colors ${mode === 'audit' ? 'bg-slate-900' : 'bg-indigo-600'}`}>
               {mode === 'audit' ? <BrainCircuit size={24} /> : <Palette size={24} />}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{mode === 'audit' ? 'AI 视觉审计中心' : 'AIGC 灵感设计工坊'}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mode === 'audit' ? 'Visual Audit & Strategy Console' : 'Creative Asset Generator'}</p>
            </div>
          </div>
          
          <div className="flex bg-slate-200 p-1 rounded-xl">
             <button onClick={() => setMode('audit')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mode === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Audit</button>
             <button onClick={() => setMode('design')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mode === 'design' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Design</button>
          </div>
        </div>

        {mode === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowConfig(!showConfig)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${showConfig ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  <Settings size={14} className={showConfig ? 'animate-spin-slow' : ''} /> {showConfig ? 'Close Config' : 'AI Config'}
                </button>

                <div className="h-6 w-px bg-slate-200 mx-1"></div>

                {/* Quick Status Badges */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                   {useOCR && <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border border-indigo-100"><ScanLine size={10} /> OCR Active</span>}
                   {useDeepThink && !useOCR && <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border border-amber-100"><Brain size={10} /> Deep Think</span>}
                   <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border border-slate-200"><Volume2 size={10} /> {ttsConfig.lang.toUpperCase()}</span>
                </div>

                <div className="flex-1"></div>
                
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-full max-w-[180px] overflow-hidden">
                   <Link size={14} className={`flex-shrink-0 ${selectedContextId ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                   <select 
                     value={selectedContextId} 
                     onChange={(e) => setSelectedContextId(e.target.value)}
                     className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full uppercase"
                   >
                     <option value="">Link Context</option>
                     {contextOptions.map(tx => (
                       <option key={tx.id} value={tx.id}>
                         {tx.locationName} ({new Date(tx.timestamp).toLocaleDateString()})
                       </option>
                     ))}
                   </select>
                </div>
            </div>

            {/* Config Panel */}
            {showConfig && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><BrainCircuit size={12}/> 识别模式 Analysis Mode</p>
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
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Volume2 size={12}/> 语音配置 Voice & Language</p>
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
            )}
          </div>
        )}
      </div>

      {mode === 'audit' ? (
        <div className="flex-1 flex flex-col min-h-0">
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
                           <Volume2 size={12} /> {ttsConfig.lang === 'zh' ? '播放' : ttsConfig.lang === 'sw' ? 'Soma' : 'Play'}
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
                  disabled={loading || (!query.trim() && !selectedImage && !selectedContextId)} 
                  className="absolute right-2 top-2 bottom-2 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-xl active:scale-90 transition-all disabled:opacity-30"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto">
           <div className="bg-indigo-50 p-6 rounded-[32px] border border-indigo-100 space-y-4">
              <div className="flex items-center justify-between">
                 <h3 className="text-sm font-black text-indigo-900 uppercase">图标/海报生成器</h3>
                 <Sparkles size={18} className="text-indigo-500" />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">描述需求 (Prompt)</label>
                 <textarea 
                   value={imagePrompt}
                   onChange={e => setImagePrompt(e.target.value)}
                   className="w-full h-24 bg-white border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                   placeholder="Describe the icon or asset you want..."
                 />
              </div>
              <button 
                onClick={handleGenerateImage}
                disabled={isGeneratingImg || !imagePrompt}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingImg ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                {isGeneratingImg ? 'AI 正在绘制中...' : '开始生成 GENERATE'}
              </button>
           </div>

           {generatedImage && (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95">
                <div className="relative group w-full max-w-sm aspect-square bg-slate-100 rounded-[40px] overflow-hidden shadow-2xl border-4 border-white">
                   <img src={generatedImage} className="w-full h-full object-cover" alt="Generated Asset" />
                   <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <a href={generatedImage} download="bahati_asset_gen.png" className="p-4 bg-white rounded-full text-slate-900 shadow-xl hover:scale-110 transition-transform">
                         <Download size={24} />
                      </a>
                   </div>
                </div>
                <div className="text-center">
                   <p className="text-sm font-black text-slate-900 uppercase">生成成功</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">点击图片下载素材</p>
                </div>
             </div>
           )}
           
           {!generatedImage && !isGeneratingImg && (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-300 space-y-4 opacity-50">
                <ImageIcon size={64} strokeWidth={1} />
                <p className="text-xs font-black uppercase tracking-widest">预览区域 Preview Area</p>
             </div>
           )}
        </div>
      )}
    </div>
  );
};

export default AIHub;

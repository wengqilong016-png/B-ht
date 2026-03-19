import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { BrainCircuit, Send, Loader2, Camera, X, ShieldCheck, Activity, ScanLine, Brain, Volume2, Link, Palette, Settings } from 'lucide-react';
import { Driver, Location, Transaction, User as UserType, AILog, safeRandomUUID, resizeImage } from '../../types';
import AIReviewModal, { PendingReviewData } from './AIReviewModal';
import AIConfigPanel, { TtsConfig } from './AIConfigPanel';
import AIChatMessages, { ChatMessage } from './AIChatMessages';
import AIDesignMode from './AIDesignMode';
import { useAIHubData } from './hooks/useAIHubData';

interface AIHubProps {
  drivers: Driver[];
  locations: Location[];
  transactions: Transaction[];
  onLogAI: (log: AILog) => void;
  currentUser: UserType;
  initialContextId?: string;
  onClearContext?: () => void;
}

const AIHubPage: React.FC<AIHubProps> = ({ drivers, locations, transactions, onLogAI, currentUser, initialContextId, onClearContext }) => {
  const activeDriverId = currentUser.driverId ?? currentUser.id;
  const [mode, setMode] = useState<'audit' | 'design'>('audit');

  // Audit Configuration State
  const [showConfig, setShowConfig] = useState(false);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>({ lang: 'zh', voice: 'Kore' });
  const [useDeepThink, setUseDeepThink] = useState(false);
  const [useOCR, setUseOCR] = useState(false);

  // Audit Interaction State
  const [query, setQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
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

  const { contextOptions } = useAIHubData(transactions, selectedContextId);

  // Sync initial context if provided
  useEffect(() => {
    if (initialContextId) {
      setSelectedContextId(initialContextId);
      if (onClearContext) onClearContext();
    }
  }, [initialContextId]);

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
        case 'zh': default: promptPrefix = 'Read this business content in a professional voice: '; break;
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      resizeImage(file).then(setSelectedImage);
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
        contents: { parts: [{ text: imagePrompt }] },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          setGeneratedImage(`data:image/png;base64,${base64EncodeString}`);
          onLogAI({
            id: `GEN-${Date.now()}`,
            timestamp: new Date().toISOString(),
            driverId: activeDriverId,
            driverName: currentUser.name,
            query: `[Image Gen] ${imagePrompt}`,
            response: "Image Generated Successfully",
            modelUsed: "gemini-2.5-flash-image",
            imageUrl: `data:image/png;base64,${base64EncodeString}`
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

    const userDisplayMsg = pendingReview.isOCR
      ? "OCR 读数识别请求"
      : (pendingReview.originalQuery || "图像分析请求");

    setChat(prev => [...prev, { role: 'user', content: userDisplayMsg, image: pendingReview.image }]);

    let botResponse = pendingReview.summary;
    if (pendingReview.isOCR || pendingReview.reading) {
      botResponse = `[CONFIRMED AUDIT]\nReading: ${pendingReview.reading}\nCondition: ${pendingReview.condition}\n\nAnalysis:\n${pendingReview.summary}`;
    }

    const linkedTx = selectedContextId ? transactions.find(t => t.id === selectedContextId) : null;

    setChat(prev => [...prev, { role: 'bot', content: botResponse, sources: pendingReview.sources, isThinking: false }]);

    const newLog: AILog = {
      id: safeRandomUUID(),
      timestamp: new Date().toISOString(),
      driverId: activeDriverId,
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

    setShowConfig(false);
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
        parts.push({ inlineData: { data: userImg.split(',')[1], mimeType: 'image/jpeg' } });
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
            : `You are the SmartKiosk chief audit consultant.
              Business context:
              - ${locations.length} machine locations in the network.
              - Location details: ${JSON.stringify(locations.map(l => ({ id: l.machineId, name: l.name, lastScore: l.lastScore, area: l.area })))}
              - Coin value: 1 coin = 200 TZS.
              Answer style: professional, concise, strategic. Use English.`
        }
      });

      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      let resultText = response.text || "";

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
            parsedData.summary = resultText;
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
        setChat(prev => [...prev, { role: 'user', content: userMsg }]);
        setChat(prev => [...prev, { role: 'bot', content: resultText, sources: sources }]);

        onLogAI({
          id: safeRandomUUID(),
          timestamp: new Date().toISOString(),
          driverId: activeDriverId,
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
        <AIReviewModal
          pendingReview={pendingReview}
          onUpdate={setPendingReview}
          onClose={() => setPendingReview(null)}
          onConfirm={handleConfirmReview}
        />
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

            {showConfig && (
              <AIConfigPanel
                useOCR={useOCR}
                setUseOCR={setUseOCR}
                useDeepThink={useDeepThink}
                setUseDeepThink={setUseDeepThink}
                ttsConfig={ttsConfig}
                setTtsConfig={setTtsConfig}
              />
            )}
          </div>
        )}
      </div>

      {mode === 'audit' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <AIChatMessages
            chat={chat}
            loading={loading}
            useOCR={useOCR}
            useDeepThink={useDeepThink}
            ttsConfig={ttsConfig}
            playTTS={playTTS}
          />

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
        <AIDesignMode
          imagePrompt={imagePrompt}
          setImagePrompt={setImagePrompt}
          handleGenerateImage={handleGenerateImage}
          isGeneratingImg={isGeneratingImg}
          generatedImage={generatedImage}
        />
      )}
    </div>
  );
};

export default AIHubPage;

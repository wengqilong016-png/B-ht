import React from 'react';
import { Sparkles, Wand2, Loader2, Download, ImageIcon } from 'lucide-react';

interface AIDesignModeProps {
  imagePrompt: string;
  setImagePrompt: (v: string) => void;
  handleGenerateImage: () => void;
  isGeneratingImg: boolean;
  generatedImage: string | null;
}

const AIDesignMode: React.FC<AIDesignModeProps> = ({
  imagePrompt, setImagePrompt, handleGenerateImage, isGeneratingImg, generatedImage
}) => (
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
);

export default AIDesignMode;

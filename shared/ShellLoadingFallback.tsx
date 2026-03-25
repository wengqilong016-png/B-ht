import React from 'react';
import { Loader2 } from 'lucide-react';

const ShellLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12">
    <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Module...</p>
  </div>
);

export default ShellLoadingFallback;

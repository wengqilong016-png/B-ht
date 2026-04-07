import React from 'react';

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  type?: string;
  placeholder?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange, icon, type = "text", placeholder }) => (
  <div className="space-y-1 flex-1">
    <label className="text-caption font-black text-slate-400 uppercase ml-1 tracking-widest">{label}</label>
    <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus-within:border-indigo-400 transition-all">
      <span className="text-slate-400 mr-2">{icon}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent w-full text-xs font-bold outline-none text-slate-900 placeholder:text-slate-300 placeholder:font-normal" />
    </div>
  </div>
);

export default InputField;

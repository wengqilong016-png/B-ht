import React from 'react';

interface ScoreInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function ScoreInput({ value, onChange, placeholder = '0' }: ScoreInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 border-2 border-amber-500/50 focus:border-amber-500 rounded-xl px-4 text-amber-400 placeholder-slate-600 focus:outline-none font-mono font-bold"
      style={{
        minHeight: '64px',
        fontSize: '28px',
        textAlign: 'center',
      }}
    />
  );
}

import React from 'react';

interface SubmitButtonProps {
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
}

export default function SubmitButton({
  onSubmit,
  disabled = false,
  isLoading = false,
  label,
}: SubmitButtonProps) {
  return (
    <button
      onClick={onSubmit}
      disabled={disabled || isLoading}
      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      style={{ minHeight: '52px', fontSize: '16px' }}
    >
      {isLoading ? (
        <>
          <span className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <span>提交中... / Inawasilisha...</span>
        </>
      ) : (
        <span>{label || '提交 / Wasilisha'}</span>
      )}
    </button>
  );
}

import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import React from 'react';

export type FormStatus = 'idle' | 'loading' | 'ok' | 'error';

interface StatusIconProps {
  status: FormStatus;
  size?: number;
  className?: string;
}

/**
 * Displays an icon based on the form status.
 * - loading: spinning loader
 * - ok: check circle
 * - error: alert circle
 * - idle: nothing
 */
export const StatusIcon: React.FC<StatusIconProps> = ({ status, size = 14, className = '' }) => {
  if (status === 'loading') {
    return <Loader2 size={size} className={`animate-spin text-indigo-400 ${className}`} />;
  }
  if (status === 'ok') {
    return <CheckCircle size={size} className={`text-emerald-400 ${className}`} />;
  }
  if (status === 'error') {
    return <AlertCircle size={size} className={`text-rose-400 ${className}`} />;
  }
  return null;
};

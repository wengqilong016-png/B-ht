import { useState, useCallback } from 'react';

export type FormStatus = 'idle' | 'loading' | 'ok' | 'error';

interface UseFormStatusReturn {
  status: FormStatus;
  message: string;
  setStatus: (status: FormStatus) => void;
  setMessage: (message: string) => void;
  setError: (message: string) => void;
  setSuccess: (message: string) => void;
  setLoading: () => void;
  reset: () => void;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
}

/**
 * Custom hook for managing form submission status.
 * Provides state and helpers for tracking idle/loading/ok/error states
 * and associated messages.
 *
 * @example
 * const form = useFormStatus();
 *
 * const handleSubmit = async () => {
 *   form.setLoading();
 *   const result = await submitData();
 *   if (result.success) {
 *     form.setSuccess('Data saved!');
 *   } else {
 *     form.setError(result.error);
 *   }
 * };
 */
export function useFormStatus(): UseFormStatusReturn {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState('');

  const setError = useCallback((msg: string) => {
    setStatus('error');
    setMessage(msg);
  }, []);

  const setSuccess = useCallback((msg: string) => {
    setStatus('ok');
    setMessage(msg);
  }, []);

  const setLoading = useCallback(() => {
    setStatus('loading');
    setMessage('');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage('');
  }, []);

  return {
    status,
    message,
    setStatus,
    setMessage,
    setError,
    setSuccess,
    setLoading,
    reset,
    isLoading: status === 'loading',
    isError: status === 'error',
    isSuccess: status === 'ok',
    isIdle: status === 'idle',
  };
}

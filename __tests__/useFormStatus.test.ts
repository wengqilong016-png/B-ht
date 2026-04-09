/**
 * __tests__/useFormStatus.test.ts
 *
 * Tests for hooks/useFormStatus.ts
 */
import { describe, it, expect } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

import { useFormStatus } from '../hooks/useFormStatus';

describe('useFormStatus()', () => {
  it('starts in idle state with empty message', () => {
    const { result } = renderHook(() => useFormStatus());
    expect(result.current.status).toBe('idle');
    expect(result.current.message).toBe('');
    expect(result.current.isIdle).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it('setLoading() transitions to loading state', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setLoading());
    expect(result.current.status).toBe('loading');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.message).toBe('');
  });

  it('setError() transitions to error state with message', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setError('Something went wrong'));
    expect(result.current.status).toBe('error');
    expect(result.current.isError).toBe(true);
    expect(result.current.message).toBe('Something went wrong');
  });

  it('setSuccess() transitions to ok state with message', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setSuccess('Saved!'));
    expect(result.current.status).toBe('ok');
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.message).toBe('Saved!');
  });

  it('reset() returns to idle state with empty message', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setError('Error'));
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.isIdle).toBe(true);
    expect(result.current.message).toBe('');
  });

  it('setStatus() sets any status directly', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setStatus('loading'));
    expect(result.current.status).toBe('loading');
  });

  it('setMessage() updates message independently', () => {
    const { result } = renderHook(() => useFormStatus());
    act(() => result.current.setMessage('Custom message'));
    expect(result.current.message).toBe('Custom message');
    expect(result.current.status).toBe('idle'); // status unchanged
  });
});

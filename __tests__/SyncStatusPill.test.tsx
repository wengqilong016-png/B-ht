import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import SyncStatusPill from '../shared/SyncStatusPill';
import type { SyncStatus } from '../hooks/useSyncStatus';

function makeSyncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    isOnline: true,
    isSyncing: false,
    syncFailed: false,
    unsyncedCount: 0,
    pendingCount: 0,
    retryWaitingCount: 0,
    deadLetterCount: 0,
    state: 'synced',
    lastSyncedAt: null,
    trigger: jest.fn(),
    forceRetry: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('SyncStatusPill', () => {
  it('shows queued state and opens details', () => {
    render(
      <SyncStatusPill
        syncStatus={makeSyncStatus({
          unsyncedCount: 3,
          pendingCount: 3,
          state: 'queued',
        })}
        lang="zh"
        variant="light"
      />
    );

    expect(screen.getByRole('button', { name: /3 条待同步/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /3 条待同步/i }));
    expect(screen.getByText('这些记录已经保存在本机，等待下一次同步。')).toBeTruthy();
    expect(screen.getByText('待同步')).toBeTruthy();
    expect(screen.getByText('立即重试')).toBeTruthy();
  });

  it('lets the user retry from the detail panel', () => {
    const trigger = jest.fn();
    render(
      <SyncStatusPill
        syncStatus={makeSyncStatus({
          unsyncedCount: 1,
          pendingCount: 1,
          state: 'queued',
          trigger,
        })}
        lang="sw"
        variant="light"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /1 Pending/i }));
    fireEvent.click(screen.getByRole('button', { name: /Retry Now/i }));
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('shows dead-letter state details', () => {
    render(
      <SyncStatusPill
        syncStatus={makeSyncStatus({
          unsyncedCount: 1,
          deadLetterCount: 1,
          state: 'dead_letter',
        })}
        lang="zh"
        variant="light"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /1 条需处理/i }));
    expect(screen.getByText('部分记录超过重试上限，需要你检查并重新处理。')).toBeTruthy();
  });
});

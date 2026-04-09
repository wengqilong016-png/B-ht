import { describe, expect, it, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useCollectionDraft } from '../driver/hooks/useCollectionDraft';

describe('useCollectionDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with an empty draft when nothing is persisted', () => {
    const { result } = renderHook(() => useCollectionDraft());

    expect(result.current.draft).toMatchObject({
      selectedLocId: '',
      draftTxId: '',
      currentScore: '',
      photoData: null,
      aiReviewData: null,
      gpsCoords: null,
      gpsPermission: 'prompt',
      gpsSource: null,
    });
  });

  it('restores a saved draft but resets runtime GPS state', () => {
    localStorage.setItem('bahati_collection_draft', JSON.stringify({
      selectedLocId: 'loc-1',
      draftTxId: 'tx-1',
      currentScore: '1234',
      gpsCoords: { lat: -6.8, lng: 39.2 },
      gpsPermission: 'granted',
      gpsSource: 'live',
    }));

    const { result } = renderHook(() => useCollectionDraft());

    expect(result.current.draft).toMatchObject({
      selectedLocId: 'loc-1',
      draftTxId: 'tx-1',
      currentScore: '1234',
      gpsCoords: null,
      gpsPermission: 'prompt',
      gpsSource: null,
    });
  });

  it('persists draft updates without storing large photo or AI review payloads', async () => {
    const { result } = renderHook(() => useCollectionDraft());

    act(() => {
      result.current.updateDraft({
        selectedLocId: 'loc-9',
        currentScore: '555',
        photoData: 'base64-photo',
        aiReviewData: {
          score: '555',
          condition: 'ok',
          notes: 'clear image',
          image: 'base64-image',
        },
      });
    });

    await waitFor(() => {
      const saved = localStorage.getItem('bahati_collection_draft');
      expect(saved).not.toBeNull();

      expect(JSON.parse(saved!)).toMatchObject({
        selectedLocId: 'loc-9',
        currentScore: '555',
        photoData: null,
        aiReviewData: null,
      });
    });
  });

  it('loads the latest persisted draft and resetDraft clears both state and storage', async () => {
    const { result } = renderHook(() => useCollectionDraft());

    act(() => {
      result.current.updateDraft({
        selectedLocId: 'loc-4',
        draftTxId: 'tx-4',
        expenses: '1000',
      });
    });

    await waitFor(() => {
      expect(result.current.loadDraft()).toMatchObject({
        selectedLocId: 'loc-4',
        draftTxId: 'tx-4',
        expenses: '1000',
      });
    });

    act(() => {
      result.current.resetDraft();
    });

    expect(result.current.draft).toMatchObject({
      selectedLocId: '',
      draftTxId: '',
      expenses: '',
      gpsPermission: 'prompt',
    });
    expect(localStorage.getItem('bahati_collection_draft')).toBeNull();
  });
});

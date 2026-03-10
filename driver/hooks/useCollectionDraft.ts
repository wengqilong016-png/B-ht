import { useState, useCallback, useRef } from 'react';
import { Transaction } from '../../types';

const DRAFT_STORAGE_KEY = 'bahati_collection_draft';

export interface CollectionDraft {
  selectedLocId: string;
  draftTxId: string;
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  gpsSource: 'live' | 'exif' | 'estimated' | null;
}

export interface AIReviewData {
  score: string;
  condition: string;
  notes: string;
  image: string;
}

const EMPTY_DRAFT: CollectionDraft = {
  selectedLocId: '',
  draftTxId: '',
  currentScore: '',
  photoData: null,
  aiReviewData: null,
  expenses: '',
  expenseType: 'public',
  expenseCategory: 'fuel',
  coinExchange: '',
  ownerRetention: '',
  isOwnerRetaining: true,
  gpsCoords: null,
  gpsPermission: 'prompt',
  gpsSource: null,
};

export function useCollectionDraft() {
  const [draft, setDraftState] = useState<CollectionDraft>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore everything except gps runtime state
        return { ...EMPTY_DRAFT, ...parsed, gpsCoords: null, gpsPermission: 'prompt', gpsSource: null };
      }
    } catch { /* ignore */ }
    return { ...EMPTY_DRAFT };
  });

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const saveDraft = useCallback((d: CollectionDraft) => {
    try {
      // Exclude photoData and aiReviewData from localStorage persistence
      // to avoid hitting the ~5MB quota (photos can be several MB each).
      const toSave = { ...d, photoData: null, aiReviewData: null };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore quota errors */ }
  }, []);

  const updateDraft = useCallback((partial: Partial<CollectionDraft>) => {
    setDraftState(prev => {
      const next = { ...prev, ...partial };
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraftState({ ...EMPTY_DRAFT });
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const loadDraft = useCallback((): CollectionDraft | null => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        return { ...EMPTY_DRAFT, ...JSON.parse(saved) };
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  return { draft, updateDraft, resetDraft, saveDraft, loadDraft };
}

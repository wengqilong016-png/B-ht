Here is the complete TypeScript code for the `useCollectionDraft` hook:
```typescript
// src/driver/hooks/useCollectionDraft.ts
import { useState, useEffect } from 'react';

type CollectionDraft = {
  step: number;
  machineId: string;
  photoData: {
    base64: string;
    url: string;
  };
  scores: {
    prev: number;
    curr: number;
  };
  finance: {
    revenue: number;
    expenses: number;
  };
  timestamp: Date;
};

const useCollectionDraft = (locationId: string): {
  draft: CollectionDraft | null;
  updateDraft(partialData: Partial<CollectionDraft>): void;
  clearDraft(): void;
  isRecovered: boolean;
} => {
  const [draft, setDraft] = useState<CollectionDraft | null>(null);
  const [isRecovered, setIsRecovered] = useState(false);

  useEffect(() => {
    const storageKey = `bahati_draft_${locationId}`;
    const storedDraft = localStorage.getItem(storageKey);

    if (storedDraft) {
      setDraft(JSON.parse(storedDraft));
      setIsRecovered(true);
    } else {
      setIsRecovered(false);
    }
  }, [locationId]);

  const updateDraft = (partialData: Partial<CollectionDraft>) => {
    if (!draft) return;

    setDraft({ ...draft, ...partialData });
    localStorage.setItem(`bahati_draft_${locationId}`, JSON.stringify(draft));
  };

  const clearDraft = () => {
    setDraft(null);
    localStorage.removeItem(`bahati_draft_${locationId}`);
  };

  return {
    draft,
    updateDraft,
    clearDraft,
    isRecovered,
  };
};

export default useCollectionDraft;
```
Here's a brief explanation of the code:

1. We define a `CollectionDraft` type to represent the structure of the draft data.
2. The `useCollectionDraft` hook takes a `locationId` string as an input and returns an object with four properties: `draft`, `updateDraft`, `clearDraft`, and `isRecovered`.
3. We use the `useState` hook to store the draft data and a boolean flag `isRecovered` to indicate whether the data is recovered from storage or not.
4. In the `useEffect` hook, we check if there is a stored draft for the given `locationId` and update the state accordingly.
5. The `updateDraft` function updates the draft data and stores it in local storage.
6. The `clearDraft` function clears the draft data and removes it from local storage.
7. We export the `useCollectionDraft` hook for use in React components.

Note that this implementation uses JSON serialization to store the draft data in local storage, so make sure to handle any potential issues with encoding and decoding accordingly.


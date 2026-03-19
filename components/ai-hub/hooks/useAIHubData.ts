import { useMemo } from 'react';
import { Transaction } from '../../../types';

export function useAIHubData(transactions: Transaction[], selectedContextId: string) {
  const contextOptions = useMemo(() => {
    const list = transactions.slice(0, 10);
    if (selectedContextId && !list.find(t => t.id === selectedContextId)) {
      const selected = transactions.find(t => t.id === selectedContextId);
      if (selected) list.unshift(selected);
    }
    return list;
  }, [transactions, selectedContextId]);

  return { contextOptions };
}

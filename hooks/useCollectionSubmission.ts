import { useState, useCallback } from 'react';
import { type Transaction } from '../types';
import {
  orchestrateCollectionSubmission,
  type OrchestrateCollectionSubmissionInput,
} from '../services/collectionSubmissionOrchestrator';

/**
 * Discriminated-union state exposed by useCollectionSubmission.
 *
 * - idle        — no in-flight submission
 * - submitting  — orchestrator call in progress
 * - success     — submission accepted (server or offline queue)
 * - error       — submission threw an unexpected error
 */
export type CollectionSubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; source: 'server' | 'offline'; transaction: Transaction }
  | { status: 'error'; message: string };

export interface UseCollectionSubmissionResult {
  state: CollectionSubmissionState;
  /** Call with all submission inputs; resolves once the state has transitioned. */
  submit: (input: OrchestrateCollectionSubmissionInput) => Promise<void>;
  /** Reset state back to idle (call after consuming a success or error). */
  reset: () => void;
}

/**
 * Encapsulates the submission orchestration state machine.
 * Components call `submit()` and react to `state` transitions;
 * side effects such as alerts and navigation remain in the component.
 */
export function useCollectionSubmission(): UseCollectionSubmissionResult {
  const [state, setState] = useState<CollectionSubmissionState>({ status: 'idle' });

  const submit = useCallback(async (input: OrchestrateCollectionSubmissionInput) => {
    setState({ status: 'submitting' });
    try {
      const result = await orchestrateCollectionSubmission(input);
      setState({
        status: 'success',
        source: result.source,
        transaction: result.transaction,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submission failed';
      setState({ status: 'error', message });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, submit, reset };
}

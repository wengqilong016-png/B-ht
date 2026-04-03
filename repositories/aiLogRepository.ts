/** Pure functions for writing to the `ai_logs` table. */

import { supabase } from '../supabaseClient';
import type { AILog } from '../types/models';

export async function insertAiLog(log: AILog): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase
    .from('ai_logs')
    .insert({ ...log, isSynced: true });
  if (error) throw error;
}

export async function fetchAiLogs(signal?: AbortSignal): Promise<AILog[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const query = supabase
    .from('ai_logs')
    .select('id, timestamp, driverId, driverName, query, response, imageUrl, modelUsed, relatedLocationId, relatedTransactionId')
    .order('timestamp', { ascending: false });
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AILog[];
}

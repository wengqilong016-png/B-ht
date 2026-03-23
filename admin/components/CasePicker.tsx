/**
 * CasePicker
 * ──────────────────────────────────────────────────────────────────────────────
 * Shared dropdown for selecting an existing support case (stage 9).
 *
 * Used by QueueDiagnostics, FleetDiagnostics, and HealthAlerts to link
 * operator actions to real support cases instead of requiring manual ID entry.
 *
 * Features:
 *   • Fetches open cases on mount and exposes a refresh button
 *   • Allows selecting an open case from a dropdown
 *   • Allows clearing the selection
 *   • Falls back to manual text input ONLY when no open cases exist (fresh deploy)
 *   • Once real cases are available, manual free-text entry is disabled to
 *     enforce valid case linkage
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, ChevronDown, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  fetchSupportCases,
  type SupportCase,
} from '../../services/supportCaseService';

export interface CasePickerProps {
  /** Currently selected case ID (controlled). */
  value: string;
  /** Called when the operator selects or clears a case. */
  onChange: (caseId: string) => void;
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
}

const CasePicker: React.FC<CasePickerProps> = ({ value, onChange, supabaseClient: injectedClient }) => {
  const client = injectedClient ?? supabase;
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadCases = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const result = await fetchSupportCases(client, { status: 'open', limit: 50 });
      setCases(result);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [client]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // On initial load, clear any stale manual value that doesn't match a real case.
  // This only fires once (when loaded transitions to true) so refreshes never
  // disrupt an intentional user selection.
  useEffect(() => {
    if (loaded && cases.length > 0 && value && !cases.some((c) => c.id === value)) {
      onChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on initial load
  }, [loaded]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange('');
  };

  // Manual text input is shown ONLY when no open cases exist (fresh deploy).
  // Once real cases are available, operators must pick from the dropdown.
  const showManualInput = loaded && !loading && cases.length === 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Briefcase size={13} className="text-indigo-500 shrink-0" />
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide shrink-0">Case</span>

      {!showManualInput ? (
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <select
            value={value}
            onChange={handleSelect}
            disabled={loading}
            className="w-full appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            <option value="">— no case linked —</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}{c.title ? ` — ${c.title}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. CASE-2026-001"
          className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      )}

      {value && (
        <button
          onClick={handleClear}
          className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          title="Clear case selection"
        >
          <X size={12} />
        </button>
      )}

      <button
        onClick={loadCases}
        disabled={loading}
        className="p-1 rounded-md text-slate-400 hover:text-indigo-500 transition-colors disabled:opacity-50"
        title="Refresh cases list"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
      </button>
    </div>
  );
};

export default CasePicker;

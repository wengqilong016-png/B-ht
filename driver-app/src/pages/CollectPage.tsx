import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Driver, Location, Transaction, COIN_VALUE_TZS, safeRandomUUID } from '../types';
import { enqueueTx } from '../offlineQueue';
import MachineSelector from '../components/MachineSelector';
import ScoreInput from '../components/ScoreInput';
import SubmitButton from '../components/SubmitButton';

interface CollectPageProps {
  driver: Driver;
  isOnline: boolean;
}

type Step = 'select' | 'fill' | 'submitting' | 'done';

interface CollectionDraft {
  location: Location;
  currentScore: string;
  expenses: string;
  coinExchange: string;
  notes: string;
}

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
    );
  });
}

export default function CollectPage({ driver, isOnline }: CollectPageProps) {
  const [step, setStep] = useState<Step>('select');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [draft, setDraft] = useState<CollectionDraft | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    txId?: string;
    offline?: boolean;
  } | null>(null);
  const [submitError, setSubmitError] = useState('');

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select(
          'id, name, machineId, lastScore, area, assignedDriverId, coords, commissionRate, status'
        )
        .eq('assignedDriverId', driver.id)
        .eq('status', 'active');

      if (!error && data) {
        setLocations(
          data.map((d) => ({
            id: d.id,
            name: d.name,
            machineId: d.machineId || '',
            lastScore: d.lastScore ?? 0,
            area: d.area || '',
            assignedDriverId: d.assignedDriverId || driver.id,
            coords: d.coords,
            commissionRate: d.commissionRate ?? 0.3,
            status: d.status || 'active',
          }))
        );
      }
    } catch {
      // leave empty
    } finally {
      setLocationsLoading(false);
    }
  }, [driver.id]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const handleSelectLocation = (loc: Location) => {
    setDraft({
      location: loc,
      currentScore: '',
      expenses: '',
      coinExchange: '',
      notes: '',
    });
    setStep('fill');
  };

  const handleBack = () => {
    setStep('select');
    setDraft(null);
    setSubmitResult(null);
    setSubmitError('');
  };

  const handleSubmit = async () => {
    if (!draft) return;

    const currentScore = parseFloat(draft.currentScore);
    if (isNaN(currentScore) || currentScore < 0) {
      setSubmitError('请输入有效的当前分数 / Weka alama sahihi ya sasa');
      return;
    }

    const previousScore = draft.location.lastScore;
    const scoreDiff = Math.max(0, currentScore - previousScore);
    const revenue = scoreDiff * COIN_VALUE_TZS;
    const commission = Math.floor(revenue * draft.location.commissionRate);
    const expenses = parseFloat(draft.expenses) || 0;
    const coinExchange = parseFloat(draft.coinExchange) || 0;
    const netPayable = Math.max(0, revenue - commission - expenses);

    const txId = `TX-${Date.now()}-${driver.id.slice(0, 6)}-${safeRandomUUID().slice(0, 4)}`;

    const tx: Transaction = {
      id: txId,
      localId: safeRandomUUID(),
      timestamp: new Date().toISOString(),
      locationId: draft.location.id,
      locationName: draft.location.name,
      driverId: driver.id,
      driverName: driver.name,
      previousScore,
      currentScore,
      revenue,
      commission,
      netPayable,
      expenses,
      coinExchange,
      notes: draft.notes,
      isSynced: false,
    };

    setStep('submitting');
    setSubmitError('');

    // Get GPS
    const gps = await getGps();
    if (gps) tx.gps = gps;

    // Try direct Supabase insert first
    let insertedOnline = false;
    if (isOnline) {
      try {
        const { error } = await supabase.from('transactions').upsert(
          {
            id: tx.id,
            timestamp: tx.timestamp,
            locationId: tx.locationId,
            locationName: tx.locationName,
            driverId: tx.driverId,
            driverName: tx.driverName,
            previousScore: tx.previousScore,
            currentScore: tx.currentScore,
            revenue: tx.revenue,
            commission: tx.commission,
            netPayable: tx.netPayable,
            expenses: tx.expenses,
            coinExchange: tx.coinExchange,
            notes: tx.notes,
            gps: tx.gps,
            isSynced: true,
          },
          { onConflict: 'id' }
        );

        if (!error) {
          insertedOnline = true;
          // Update lastScore on location
          await supabase
            .from('locations')
            .update({ lastScore: currentScore })
            .eq('id', draft.location.id);
        }
      } catch {
        insertedOnline = false;
      }
    }

    if (!insertedOnline) {
      // Save to offline queue
      await enqueueTx(tx);
      setSubmitResult({ success: true, txId: tx.id, offline: true });
    } else {
      setSubmitResult({ success: true, txId: tx.id, offline: false });
      // Refresh locations to get updated lastScore
      loadLocations();
    }

    setStep('done');
  };

  // Derived values for fill step
  const getDerivedValues = () => {
    if (!draft) return null;
    const currentScore = parseFloat(draft.currentScore);
    if (isNaN(currentScore)) return null;
    const previousScore = draft.location.lastScore;
    const scoreDiff = Math.max(0, currentScore - previousScore);
    const revenue = scoreDiff * COIN_VALUE_TZS;
    const commission = Math.floor(revenue * draft.location.commissionRate);
    const expenses = parseFloat(draft.expenses) || 0;
    const netPayable = Math.max(0, revenue - commission - expenses);
    return { scoreDiff, revenue, commission, netPayable };
  };

  const formatTZS = (n: number) =>
    n.toLocaleString('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });

  // ── Step: Select ─────────────────────────────────────────────────────────────
  if (step === 'select') {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-slate-100">
            📦 收款 / Kukusanya
          </h1>
          <button
            onClick={loadLocations}
            className="text-amber-500 text-sm p-2"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            🔄
          </button>
        </div>
        <MachineSelector
          locations={locations}
          isLoading={locationsLoading}
          onSelect={handleSelectLocation}
        />
      </div>
    );
  }

  // ── Step: Fill ────────────────────────────────────────────────────────────────
  if (step === 'fill' && draft) {
    const derived = getDerivedValues();
    return (
      <div className="p-4 space-y-4">
        {/* Machine info */}
        <div className="bg-slate-800 rounded-xl p-4">
          <button onClick={handleBack} className="text-amber-500 text-sm mb-2 flex items-center gap-1">
            ← 返回 / Rudi
          </button>
          <h2 className="font-bold text-slate-100 text-lg">{draft.location.name}</h2>
          <p className="text-slate-400 text-sm">{draft.location.area} · #{draft.location.machineId}</p>
          <p className="text-slate-400 text-sm mt-1">
            上次分数 / Alama ya mwisho:{' '}
            <span className="text-amber-400 font-mono font-bold">{draft.location.lastScore.toLocaleString()}</span>
          </p>
        </div>

        {/* Current score */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            当前分数 / Alama ya sasa *
          </label>
          <ScoreInput
            value={draft.currentScore}
            onChange={(v) => setDraft((d) => d ? { ...d, currentScore: v } : d)}
            placeholder="0"
          />
        </div>

        {/* Expenses */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            支出 / Gharama (TZS, optional)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={draft.expenses}
            onChange={(e) => setDraft((d) => d ? { ...d, expenses: e.target.value } : d)}
            placeholder="0"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-base"
            style={{ minHeight: '48px' }}
          />
        </div>

        {/* Coin exchange */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            零钱兑换 / Kubadilisha sarafu (TZS, optional)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={draft.coinExchange}
            onChange={(e) => setDraft((d) => d ? { ...d, coinExchange: e.target.value } : d)}
            placeholder="0"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-base"
            style={{ minHeight: '48px' }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            备注 / Maelezo (optional)
          </label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => d ? { ...d, notes: e.target.value } : d)}
            placeholder="..."
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-base resize-none"
          />
        </div>

        {/* Summary */}
        {derived && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-400 mb-2">汇总 / Muhtasari</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">分差 / Tofauti ya alama</span>
              <span className="text-slate-100 font-mono">{derived.scoreDiff.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">总收入 / Mapato</span>
              <span className="text-slate-100 font-mono">{formatTZS(derived.revenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">店主留成 / Toa kwa mmiliki</span>
              <span className="text-slate-100 font-mono">-{formatTZS(derived.commission)}</span>
            </div>
            {parseFloat(draft.expenses) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">支出 / Gharama</span>
                <span className="text-slate-100 font-mono">-{formatTZS(parseFloat(draft.expenses))}</span>
              </div>
            )}
            <div className="border-t border-slate-700 pt-2 flex justify-between">
              <span className="text-slate-300 font-semibold">应付款 / Analipwa</span>
              <span className="text-amber-400 font-bold font-mono text-lg">{formatTZS(derived.netPayable)}</span>
            </div>
          </div>
        )}

        {submitError && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {submitError}
          </div>
        )}

        <SubmitButton
          onSubmit={handleSubmit}
          disabled={!draft.currentScore}
          isLoading={false}
        />
      </div>
    );
  }

  // ── Step: Submitting ──────────────────────────────────────────────────────────
  if (step === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 p-8 text-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300">正在提交... / Inawasilisha...</p>
      </div>
    );
  }

  // ── Step: Done ────────────────────────────────────────────────────────────────
  if (step === 'done' && submitResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 p-8 text-center space-y-4">
        {submitResult.success ? (
          <>
            <div className="text-5xl">{submitResult.offline ? '⏳' : '✅'}</div>
            <h2 className="text-xl font-bold text-slate-100">
              {submitResult.offline
                ? '已保存，等待同步 / Imehifadhiwa, inasubiri sync'
                : '提交成功 / Imetumwa!'}
            </h2>
            {submitResult.txId && (
              <p className="text-slate-400 text-sm font-mono break-all">{submitResult.txId}</p>
            )}
          </>
        ) : (
          <>
            <div className="text-5xl">❌</div>
            <h2 className="text-xl font-bold text-red-400">提交失败 / Imeshindwa</h2>
          </>
        )}
        <button
          onClick={handleBack}
          className="bg-amber-500 text-slate-900 font-bold rounded-lg px-8 w-full"
          style={{ minHeight: '52px', fontSize: '16px' }}
        >
          继续收款 / Endelea Kukusanya
        </button>
      </div>
    );
  }

  return null;
}

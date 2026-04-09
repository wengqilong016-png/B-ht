import { Search, Pencil, Trash2, Save, Loader2, Store, X, Image as ImageIcon } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { logFinanceAuditBatch } from '../../services/financeAuditService';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';
import { getLocationDeletionDiagnostics, normalizeMachineId } from '../../utils/locationWorkflow';

interface SitesTabProps {
  managedLocations: Location[];
  allAreas: string[];
  siteSearch: string;
  setSiteSearch: (v: string) => void;
  siteFilterArea: string;
  setSiteFilterArea: (v: string) => void;
  driverMap: Map<string, Driver>;
  drivers: Driver[];
  locations: Location[];
  onUpdateLocations: (locations: Location[]) => Promise<void> | void;
  onDeleteLocations?: (ids: string[]) => Promise<void> | void;
  transactions: Transaction[];
  pendingResetRequests: Transaction[];
  pendingPayoutRequests: Transaction[];
  isOnline: boolean;
  lang: 'zh' | 'sw';
  actorId?: string;
}

const SitesTab: React.FC<SitesTabProps> = ({
  managedLocations,
  allAreas,
  siteSearch,
  setSiteSearch,
  siteFilterArea,
  setSiteFilterArea,
  driverMap,
  drivers,
  locations,
  onUpdateLocations,
  onDeleteLocations,
  transactions,
  pendingResetRequests,
  pendingPayoutRequests,
  isOnline,
  lang,
  actorId,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [viewingPhotoLoc, setViewingPhotoLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({
    name: '',
    area: '',
    machineId: '',
    latitude: '',
    longitude: '',
    commissionRate: '',
    lastScore: '',
    status: 'active' as Location['status'],
    ownerName: '',
    shopOwnerPhone: '',
    assignedDriverId: '',
    initialStartupDebt: '',
    remainingStartupDebt: '',
  });
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const deletionDiagnosticsById = useMemo(() => {
    return new Map(
      managedLocations.map((loc) => [
        loc.id,
        getLocationDeletionDiagnostics({
          location: loc,
          transactions,
          pendingResetRequests,
          pendingPayoutRequests,
          isAdminOverride: true,
        }),
      ]),
    );
  }, [managedLocations, pendingPayoutRequests, pendingResetRequests, transactions]);

  const handleEditLocation = (loc: Location) => {
    setEditingLoc(loc);
    setLocEditForm({
      name: loc.name,
      area: loc.area || '',
      machineId: loc.machineId || '',
      latitude: loc.coords?.lat?.toString() || '',
      longitude: loc.coords?.lng?.toString() || '',
      commissionRate: (loc.commissionRate * 100).toString(),
      lastScore: loc.lastScore.toString(),
      status: loc.status,
      ownerName: loc.ownerName || '',
      shopOwnerPhone: loc.shopOwnerPhone || '',
      assignedDriverId: loc.assignedDriverId || '',
      initialStartupDebt: loc.initialStartupDebt.toString(),
      remainingStartupDebt: loc.remainingStartupDebt.toString(),
    });
  };

  const handleSaveLocation = async () => {
    if (!editingLoc) return;
    const normalizedMachineId = normalizeMachineId(locEditForm.machineId);
    const parsedLat = Number.parseFloat(locEditForm.latitude);
    const parsedLng = Number.parseFloat(locEditForm.longitude);
    const hasManualCoords = locEditForm.latitude.trim() !== '' || locEditForm.longitude.trim() !== '';

    if (!normalizedMachineId) {
      showToast('请输入有效机器编号。\nEnter a valid machine ID.', 'warning');
      return;
    }

    const duplicateMachineExists = locations.some(
      (location) =>
        location.id !== editingLoc.id &&
        normalizeMachineId(location.machineId) === normalizedMachineId,
    );

    if (duplicateMachineExists) {
      showToast(`机器编号 ${normalizedMachineId} 已存在。\nMachine ID ${normalizedMachineId} already exists.`, 'error');
      return;
    }

    if (hasManualCoords) {
      const coordsValid =
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180;

      if (!coordsValid) {
        showToast('请输入有效的 Latitude / Longitude 坐标。\nEnter valid latitude / longitude coordinates.', 'warning');
        return;
      }
    }

    setIsSavingLoc(true);
    const rate = parseFloat(locEditForm.commissionRate) / 100;
    const updated: Location = {
      ...editingLoc,
      name: locEditForm.name,
      area: locEditForm.area,
      machineId: normalizedMachineId,
      coords: hasManualCoords
        ? { lat: parsedLat, lng: parsedLng }
        : editingLoc.coords,
      commissionRate: isNaN(rate) ? editingLoc.commissionRate : rate,
      lastScore: parseInt(locEditForm.lastScore) || editingLoc.lastScore,
      status: locEditForm.status,
      ownerName: locEditForm.ownerName,
      shopOwnerPhone: locEditForm.shopOwnerPhone,
      assignedDriverId: locEditForm.assignedDriverId || undefined,
      initialStartupDebt: parseInt(locEditForm.initialStartupDebt) || 0,
      remainingStartupDebt: parseInt(locEditForm.remainingStartupDebt) || 0,
      isSynced: false,
    };
    try {
      await onUpdateLocations(locations.map(l => l.id === updated.id ? updated : l));

      // Fire-and-forget audit entries for financial field changes
      const auditEntries: Parameters<typeof logFinanceAuditBatch>[0] = [];
      if (editingLoc.commissionRate !== updated.commissionRate) {
        auditEntries.push({
          event_type: 'commission_rate_change',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: editingLoc.commissionRate,
          new_value: updated.commissionRate,
        });
      }
      if ((editingLoc.remainingStartupDebt ?? 0) !== (updated.remainingStartupDebt ?? 0)) {
        auditEntries.push({
          event_type: 'startup_debt_edit',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: editingLoc.remainingStartupDebt ?? 0,
          new_value: updated.remainingStartupDebt ?? 0,
        });
      }
      if (auditEntries.length > 0) logFinanceAuditBatch(auditEntries);

      setEditingLoc(null);
      showToast(lang === 'zh' ? '点位已保存' : 'Location saved', 'success');
    } catch (error) {
      console.error('Failed to save location changes:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`点位保存失败，未写入系统。\nFailed to save: ${message}`, 'error');
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleDeleteLocation = async (locId: string) => {
    if (!isOnline) {
      showToast(
        lang === 'zh'
          ? '当前处于离线状态，无法删除机器。请联网后再操作。'
          : 'You are offline. Cannot delete a machine while offline. Please reconnect.',
        'warning',
      );
      return;
    }
    const diagnostics = deletionDiagnosticsById.get(locId);
    if (!diagnostics) return;

    if (diagnostics.blockers.length > 0) {
      showToast(`当前机器还不能删除：${diagnostics.blockers[0]}`, 'error');
      return;
    }

    const warningText =
      diagnostics.warnings.length > 0
        ? `\n\n删除提醒：\n- ${diagnostics.warnings.join('\n- ')}`
        : '';

    const ok = await confirm({
      title: lang === 'zh' ? '确认删除机器点位' : 'Confirm Delete Location',
      message: `此操作不可撤销。${warningText}`,
      confirmLabel: lang === 'zh' ? '确认删除' : 'Delete',
      cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
      destructive: true,
    });
    if (!ok || !onDeleteLocations) return;

    const loc = managedLocations.find((l) => l.id === locId);
    if (loc?.assignedDriverId) {
      const unassigned: Location = { ...loc, assignedDriverId: undefined, isSynced: false };
      await onUpdateLocations(locations.map((l) => (l.id === locId ? unassigned : l)));
    }

    try {
      await onDeleteLocations([locId]);
      setEditingLoc(null);
      showToast(lang === 'zh' ? '机器已删除' : 'Location deleted', 'success');
    } catch (error) {
      console.error('Failed to delete location:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`删除失败，系统拒绝了本次操作。\nDelete failed: ${message}`, 'error');
    }
  };

  const handleForceClearBlockers = async (locId: string) => {
    if (!isOnline) {
      showToast(lang === 'zh' ? '离线状态无法执行此操作' : 'Cannot clear while offline', 'warning');
      return;
    }
    const loc = managedLocations.find((l) => l.id === locId);
    if (!loc) return;

    const diagnostics = deletionDiagnosticsById.get(locId);
    if (!diagnostics || diagnostics.blockers.length === 0) return;

    const ok = await confirm({
      title: lang === 'zh' ? '强制清除删除阻塞' : 'Force Clear Blockers',
      message: lang === 'zh'
        ? `将对机器「${loc.name}」执行以下操作：\n• 启动债务清零\n• 分红余额清零\n• 解除重置锁定\n\n此操作不可撤销，请确认。`
        : `This will clear startup debt, dividend balance and reset lock for "${loc.name}".\nThis cannot be undone.`,
      confirmLabel: lang === 'zh' ? '确认清除' : 'Clear',
      cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    try {
      const cleared: Location = {
        ...loc,
        remainingStartupDebt: 0,
        dividendBalance: 0,
        resetLocked: false,
        isSynced: false,
      };
      await onUpdateLocations(locations.map((l) => (l.id === locId ? cleared : l)));

      // Audit trail
      await logFinanceAuditBatch([{
        event_type: 'force_clear_blockers',
        entity_type: 'location',
        entity_id: locId,
        entity_name: loc.name,
        actor_id: actorId ?? 'admin',
        old_value: loc.remainingStartupDebt,
        new_value: 0,
        payload: {
          action: 'force_clear_blockers',
          cleared: {
            remainingStartupDebt: loc.remainingStartupDebt,
            dividendBalance: loc.dividendBalance,
            resetLocked: loc.resetLocked,
          },
        },
      }]);

      showToast(lang === 'zh' ? '阻塞项已清除，现在可以删除该机器' : 'Blockers cleared, machine can now be deleted', 'success');
    } catch (error) {
      console.error('Failed to clear blockers:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`清除失败：${message}`, 'error');
    }
  };

  return (
    <>
      <div className="space-y-3 animate-in fade-in">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 w-full md:w-64">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search machines..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold" />
          </div>
          <select value={siteFilterArea} onChange={e => setSiteFilterArea(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-black uppercase outline-none">
            <option value="all">ALL AREAS</option>
            {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {managedLocations.map(loc => {
            const sitePhotoUrl = loc.machinePhotoUrl || loc.ownerPhotoUrl;
            const deletionDiagnostics = deletionDiagnosticsById.get(loc.id);
            const deleteBlocked = (deletionDiagnostics?.blockers.length ?? 0) > 0;
            const debtPct = loc.initialStartupDebt > 0
              ? Math.round((1 - loc.remainingStartupDebt / loc.initialStartupDebt) * 100)
              : 100;
            return (
            <div key={loc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
              {/* Photo / placeholder header */}
              <div className="h-40 bg-slate-100 relative rounded-t-2xl overflow-hidden flex-shrink-0">
                {sitePhotoUrl ? (
                  <img src={getOptimizedImageUrl(sitePhotoUrl, 400, 400)} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <Store size={36} className="text-slate-300" />
                    <span className="text-caption font-black uppercase tracking-widest text-slate-300">No Photo</span>
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-caption font-black uppercase backdrop-blur-sm ${loc.status === 'active' ? 'bg-emerald-500/90 text-white' : loc.status === 'maintenance' ? 'bg-amber-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                  {loc.status === 'active' ? (lang === 'zh' ? '运营中' : 'Active') : loc.status === 'maintenance' ? (lang === 'zh' ? '维护中' : 'Maint.') : (lang === 'zh' ? '停用' : 'Inactive')}
                </div>
                {/* View photo button */}
                {sitePhotoUrl && (
                  <button type="button" onClick={() => setViewingPhotoLoc(loc)} className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl bg-slate-950/70 px-2.5 py-1.5 text-caption font-black uppercase text-white backdrop-blur-sm">
                    <ImageIcon size={10} />
                    {lang === 'zh' ? '查看' : 'View'}
                  </button>
                )}
              </div>

              {/* Card body */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-slate-900 uppercase tracking-wide leading-tight">{loc.machineId || '—'}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{loc.name}</p>
                    {loc.area && <p className="text-caption font-bold text-slate-400 uppercase mt-0.5">{loc.area}</p>}
                    {loc.assignedDriverId && (
                      <p className="text-caption font-bold text-indigo-500 mt-1">
                        👤 {driverMap.get(loc.assignedDriverId)?.name || loc.assignedDriverId}
                      </p>
                    )}
                  </div>
                  {/* Edit button only in top-right; delete is in footer */}
                  <button onClick={() => handleEditLocation(loc)} className="flex-shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Pencil size={15} />
                  </button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                    <p className="text-caption font-black text-slate-400 uppercase mb-0.5">{lang === 'zh' ? '分数' : 'Score'}</p>
                    <p className="text-sm font-black text-slate-800">{loc.lastScore.toLocaleString()}</p>
                  </div>
                  <div className="bg-indigo-50 p-2.5 rounded-xl text-center">
                    <p className="text-caption font-black text-indigo-400 uppercase mb-0.5">{lang === 'zh' ? '佣金' : 'Comm.'}</p>
                    <p className="text-sm font-black text-indigo-700">{(loc.commissionRate * 100).toFixed(0)}%</p>
                  </div>
                  <div className={`p-2.5 rounded-xl text-center ${loc.remainingStartupDebt > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                    <p className={`text-caption font-black uppercase mb-0.5 ${loc.remainingStartupDebt > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{lang === 'zh' ? '启动债' : 'Debt'}</p>
                    <p className={`text-sm font-black ${loc.remainingStartupDebt > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{loc.remainingStartupDebt > 0 ? `${debtPct}%` : '✓'}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl text-center ${(loc.dividendBalance ?? 0) > 0 ? 'bg-teal-50' : 'bg-slate-50'}`}>
                    <p className={`text-caption font-black uppercase mb-0.5 ${(loc.dividendBalance ?? 0) > 0 ? 'text-teal-400' : 'text-slate-400'}`}>{lang === 'zh' ? '留存' : 'Retain'}</p>
                    <p className={`text-sm font-black ${(loc.dividendBalance ?? 0) > 0 ? 'text-teal-700' : 'text-slate-400'}`}>{(loc.dividendBalance ?? 0) > 0 ? `${(loc.dividendBalance ?? 0).toLocaleString()}` : '0'}</p>
                  </div>
                </div>

                {/* Startup debt detail (only if has debt) */}
                {loc.remainingStartupDebt > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-caption font-black text-amber-700 uppercase">{lang === 'zh' ? '启动债务余额' : 'Startup Debt Remaining'}</span>
                      <span className="text-caption font-bold text-amber-600">{debtPct}% {lang === 'zh' ? '已还' : 'repaid'}</span>
                    </div>
                    <div className="w-full bg-amber-200 rounded-full h-1.5 mb-1">
                      <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${debtPct}%` }} />
                    </div>
                    <p className="text-caption text-amber-700 font-bold">
                      TZS {loc.remainingStartupDebt.toLocaleString()} / {loc.initialStartupDebt.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Info pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.shopOwnerPhone ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>📞 {loc.shopOwnerPhone || (lang === 'zh' ? '无' : 'None')}</span>
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.ownerPhotoUrl ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>📷 {loc.ownerPhotoUrl ? (lang === 'zh' ? '已上传' : 'Photo') : (lang === 'zh' ? '无' : 'None')}</span>
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.coords?.lat ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>📍 {loc.coords?.lat ? (lang === 'zh' ? '已定位' : 'GPS') : (lang === 'zh' ? '无' : 'None')}</span>
                </div>

                {/* Owner name */}
                {loc.ownerName && (
                  <p className="text-xs text-slate-500 truncate">👤 {loc.ownerName}</p>
                )}
              </div>

              {/* Footer: delete button */}
              <div className="px-4 pb-4">
                {deleteBlocked ? (
                  <div className="space-y-1.5">
                    <button
                      disabled
                      title={deletionDiagnostics?.blockers.join(' | ')}
                      className="w-full bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-center cursor-not-allowed"
                    >
                      <p className="text-caption font-bold text-rose-400">{lang === 'zh' ? '⚠️ 无法删除：' : '⚠️ Blocked: '}{deletionDiagnostics?.blockers[0]}</p>
                      {(deletionDiagnostics?.blockers.length ?? 0) > 1 && (
                        <p className="text-caption text-rose-300 mt-0.5">+{(deletionDiagnostics?.blockers.length ?? 1) - 1} {lang === 'zh' ? '个阻塞项' : 'more'}</p>
                      )}
                    </button>
                    <button
                      onClick={() => void handleForceClearBlockers(loc.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 text-caption font-bold transition-colors"
                    >
                      🔓 {lang === 'zh' ? '强制清除阻塞（清零债务/余额/锁定）' : 'Force Clear Blockers'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleDeleteLocation(loc.id)}
                    title={lang === 'zh' ? '删除点位' : 'Delete location'}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-rose-100 bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 text-xs font-bold transition-colors"
                  >
                    <Trash2 size={13} />
                    {lang === 'zh' ? '删除此点位' : 'Delete Location'}
                  </button>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Location Edit Modal */}
      {editingLoc && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-card shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white"><Store size={18} /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">Edit Location</h3>
                  <p className="text-caption font-bold text-slate-400 uppercase">{editingLoc.machineId}</p>
                </div>
              </div>
              <button onClick={() => setEditingLoc(null)} className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">点位名称 Name</label>
                  <input value={locEditForm.name} onChange={e => setLocEditForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">区域 Area</label>
                  <input value={locEditForm.area} onChange={e => setLocEditForm(f => ({ ...f, area: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">机器编号 Machine ID</label>
                  <input value={locEditForm.machineId} onChange={e => setLocEditForm(f => ({ ...f, machineId: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">上次读数 Last Score</label>
                  <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm(f => ({ ...f, lastScore: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                <div>
                  <p className="text-caption font-black text-sky-600 uppercase">GPS Coordinates</p>
                  <p className="text-caption font-bold text-slate-400 uppercase">管理端可手动粘贴定位数据 / Paste coordinates manually</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-slate-400 uppercase ml-1">Latitude</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={locEditForm.latitude}
                      onChange={e => setLocEditForm(f => ({ ...f, latitude: e.target.value }))}
                      className="w-full bg-white border border-sky-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-sky-400"
                      placeholder="-6.823490"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-slate-400 uppercase ml-1">Longitude</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={locEditForm.longitude}
                      onChange={e => setLocEditForm(f => ({ ...f, longitude: e.target.value }))}
                      className="w-full bg-white border border-sky-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-sky-400"
                      placeholder="39.269510"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">分红比例 Commission (%)</label>
                  <input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm(f => ({ ...f, commissionRate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">状态 Status</label>
                  <select value={locEditForm.status} onChange={e => setLocEditForm(f => ({ ...f, status: e.target.value as Location['status'] }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black outline-none focus:border-indigo-400">
                    <option value="active">Active 正常</option>
                    <option value="maintenance">Maintenance 维护</option>
                    <option value="broken">Broken 故障</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-caption font-black text-slate-400 uppercase ml-1">分配司机 Assigned Driver</label>
                <select value={locEditForm.assignedDriverId} onChange={e => setLocEditForm(f => ({ ...f, assignedDriverId: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black outline-none focus:border-indigo-400">
                  <option value="">-- 未分配 Unassigned --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">店主 Owner Name</label>
                  <input value={locEditForm.ownerName} onChange={e => setLocEditForm(f => ({ ...f, ownerName: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-slate-400 uppercase ml-1">店主电话 Owner Phone</label>
                  <input value={locEditForm.shopOwnerPhone} onChange={e => setLocEditForm(f => ({ ...f, shopOwnerPhone: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                <p className="text-caption font-black text-amber-600 uppercase">启动押金 Startup Capital</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-slate-400 uppercase ml-1">初始启动债务 Initial</label>
                    <input type="number" value={locEditForm.initialStartupDebt} onChange={e => setLocEditForm(f => ({ ...f, initialStartupDebt: e.target.value }))} className="w-full bg-white border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-slate-400 uppercase ml-1">剩余启动债务 Remaining</label>
                    <input type="number" value={locEditForm.remainingStartupDebt} onChange={e => setLocEditForm(f => ({ ...f, remainingStartupDebt: e.target.value }))} className="w-full bg-white border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => void handleDeleteLocation(editingLoc.id)}
                disabled={(deletionDiagnosticsById.get(editingLoc.id)?.blockers.length ?? 0) > 0}
                className="p-3 bg-rose-50 border border-rose-100 text-rose-500 rounded-2xl hover:bg-rose-100 transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-300"
                title="删除点位"
              >
                <Trash2 size={16} />
              </button>
              <button onClick={() => setEditingLoc(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl text-xs font-black uppercase hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveLocation} disabled={isSavingLoc} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all">
                {isSavingLoc ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingPhotoLoc && (
        <div className="fixed inset-0 z-[85] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setViewingPhotoLoc(null)}>
          <div className="bg-white w-full max-w-2xl rounded-card shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase">{viewingPhotoLoc.name}</h3>
                <p className="text-caption font-bold text-slate-400 uppercase">{viewingPhotoLoc.machineId}</p>
              </div>
              <button onClick={() => setViewingPhotoLoc(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="bg-slate-50 p-4">
              <img
                src={getOptimizedImageUrl(viewingPhotoLoc.machinePhotoUrl || viewingPhotoLoc.ownerPhotoUrl || '', 1200, 1200)}
                alt={viewingPhotoLoc.name}
                className="w-full max-h-[70vh] object-contain rounded-card border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SitesTab;

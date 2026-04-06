import React, { useMemo, useState } from 'react';
import { Search, Pencil, Trash2, Save, Loader2, Store, X, Image as ImageIcon } from 'lucide-react';
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
}) => {
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
      alert('请输入有效机器编号。\nEnter a valid machine ID.');
      return;
    }

    const duplicateMachineExists = locations.some(
      (location) =>
        location.id !== editingLoc.id &&
        normalizeMachineId(location.machineId) === normalizedMachineId,
    );

    if (duplicateMachineExists) {
      alert(`机器编号 ${normalizedMachineId} 已存在。\nMachine ID ${normalizedMachineId} already exists.`);
      return;
    }

    if (hasManualCoords) {
      const coordsValid =
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180;

      if (!coordsValid) {
        alert('请输入有效的 Latitude / Longitude 坐标。\nEnter valid latitude / longitude coordinates.');
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
      setEditingLoc(null);
    } catch (error) {
      console.error('Failed to save location changes:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`点位保存失败，未写入系统。\nFailed to save location changes: ${message}`);
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleDeleteLocation = async (locId: string) => {
    if (!isOnline) {
      alert(
        lang === 'zh'
          ? '⚠️ 当前处于离线状态，无法删除机器。请联网后再操作。'
          : '⚠️ You are offline. Cannot delete a machine while offline. Please reconnect and try again.',
      );
      return;
    }
    const diagnostics = deletionDiagnosticsById.get(locId);
    if (!diagnostics) return;

    if (diagnostics.blockers.length > 0) {
      alert(
        `当前机器还不能删除：\n- ${diagnostics.blockers.join('\n- ')}\n\nPlease clear the blockers above before deleting this machine.`,
      );
      return;
    }

    const warningText =
      diagnostics.warnings.length > 0
        ? `\n\n删除提醒：\n- ${diagnostics.warnings.join('\n- ')}`
        : '';

    if (!window.confirm(`确认删除此机器点位？此操作不可撤销。\nDelete this location? This cannot be undone.${warningText}`)) return;
    if (!onDeleteLocations) return;

    try {
      await onDeleteLocations([locId]);
    } catch (error) {
      console.error('Failed to delete location:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`删除失败，系统拒绝了本次操作。\nDelete failed: ${message}`);
    }
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm">
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
            return (
            <div key={loc.id} className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-36 bg-slate-100 relative overflow-hidden">
                {sitePhotoUrl ? (
                  <img src={getOptimizedImageUrl(sitePhotoUrl, 400, 400)} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-300">
                    <Store size={32} />
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">No Photo</span>
                  </div>
                )}
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-black uppercase backdrop-blur-sm ${loc.status === 'active' ? 'bg-emerald-500/80 text-white' : loc.status === 'maintenance' ? 'bg-amber-500/80 text-white' : 'bg-rose-500/80 text-white'}`}>{loc.status}</div>
                {sitePhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setViewingPhotoLoc(loc)}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl bg-slate-950/75 px-2.5 py-1.5 text-[8px] font-black uppercase text-white backdrop-blur-sm"
                  >
                    <ImageIcon size={11} />
                    {lang === 'zh' ? '查看照片' : 'View Photo'}
                  </button>
                )}
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 leading-tight uppercase tracking-wide">{loc.machineId || '—'}</p>
                    {loc.area && <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{loc.area}</p>}
                    <p className="text-[9px] font-bold text-slate-500 mt-0.5 truncate">{loc.name}</p>
                    {loc.assignedDriverId && (
                      <p className="text-[9px] font-bold text-indigo-500 uppercase mt-0.5">
                        {driverMap.get(loc.assignedDriverId)?.name || loc.assignedDriverId}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void handleDeleteLocation(loc.id)}
                      disabled={deleteBlocked}
                      title={deleteBlocked ? deletionDiagnostics?.blockers.join(' | ') : 'Delete location'}
                      className="p-2 text-slate-300 hover:text-rose-500 bg-slate-50 rounded-xl transition-colors disabled:cursor-not-allowed disabled:text-slate-200 disabled:bg-slate-100"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button onClick={() => handleEditLocation(loc)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl transition-colors"><Pencil size={13} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 p-2 rounded-xl">
                    <p className="text-[7px] font-black text-slate-400 uppercase">Last Score</p>
                    <p className="text-[10px] font-black text-slate-800">{loc.lastScore.toLocaleString()}</p>
                  </div>
                  <div className="bg-indigo-50 p-2 rounded-xl">
                    <p className="text-[7px] font-black text-indigo-400 uppercase">Commission</p>
                    <p className="text-[10px] font-black text-indigo-700">{(loc.commissionRate * 100).toFixed(0)}%</p>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-xl">
                    <p className="text-[7px] font-black text-amber-400 uppercase">Startup</p>
                    <p className="text-[10px] font-black text-amber-700">{loc.remainingStartupDebt > 0 ? `${Math.round((1 - loc.remainingStartupDebt / (loc.initialStartupDebt || 1)) * 100)}%` : 'Paid'}</p>
                  </div>
                </div>
                {loc.ownerName && (
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 truncate">Owner: {loc.ownerName}</p>
                )}
                <div className="mt-2 space-y-1">
                  {deleteBlocked && (
                    <p className="text-[8px] font-bold text-rose-500 uppercase truncate">
                      {lang === 'zh' ? '删除被阻止' : 'Delete blocked'}: {deletionDiagnostics?.blockers[0]}
                    </p>
                  )}
                  {loc.createdAt && (
                    <p className="text-[8px] font-bold text-slate-400 uppercase truncate">
                      {lang === 'zh' ? '注册时间' : 'Registered'}: {new Date(loc.createdAt).toLocaleString()}
                    </p>
                  )}
                  {loc.lastRelocatedAt && (
                    <p className="text-[8px] font-bold text-slate-400 uppercase truncate">
                      {lang === 'zh' ? '最近迁点' : 'Moved'}: {new Date(loc.lastRelocatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Location Edit Modal */}
      {editingLoc && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white"><Store size={18} /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">Edit Location</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{editingLoc.machineId}</p>
                </div>
              </div>
              <button onClick={() => setEditingLoc(null)} className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">点位名称 Name</label>
                  <input value={locEditForm.name} onChange={e => setLocEditForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">区域 Area</label>
                  <input value={locEditForm.area} onChange={e => setLocEditForm(f => ({ ...f, area: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">机器编号 Machine ID</label>
                  <input value={locEditForm.machineId} onChange={e => setLocEditForm(f => ({ ...f, machineId: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">上次读数 Last Score</label>
                  <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm(f => ({ ...f, lastScore: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                <div>
                  <p className="text-[9px] font-black text-sky-600 uppercase">GPS Coordinates</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">管理端可手动粘贴定位数据 / Paste coordinates manually</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Latitude</label>
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
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Longitude</label>
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
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">分红比例 Commission (%)</label>
                  <input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm(f => ({ ...f, commissionRate: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">状态 Status</label>
                  <select value={locEditForm.status} onChange={e => setLocEditForm(f => ({ ...f, status: e.target.value as Location['status'] }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black outline-none focus:border-indigo-400">
                    <option value="active">Active 正常</option>
                    <option value="maintenance">Maintenance 维护</option>
                    <option value="broken">Broken 故障</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase ml-1">分配司机 Assigned Driver</label>
                <select value={locEditForm.assignedDriverId} onChange={e => setLocEditForm(f => ({ ...f, assignedDriverId: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black outline-none focus:border-indigo-400">
                  <option value="">-- 未分配 Unassigned --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">店主 Owner Name</label>
                  <input value={locEditForm.ownerName} onChange={e => setLocEditForm(f => ({ ...f, ownerName: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase ml-1">店主电话 Owner Phone</label>
                  <input value={locEditForm.shopOwnerPhone} onChange={e => setLocEditForm(f => ({ ...f, shopOwnerPhone: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                <p className="text-[9px] font-black text-amber-600 uppercase">启动押金 Startup Capital</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">初始金额 Initial</label>
                    <input type="number" value={locEditForm.initialStartupDebt} onChange={e => setLocEditForm(f => ({ ...f, initialStartupDebt: e.target.value }))} className="w-full bg-white border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-1">剩余欠款 Remaining</label>
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
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase">{viewingPhotoLoc.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase">{viewingPhotoLoc.machineId}</p>
              </div>
              <button onClick={() => setViewingPhotoLoc(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="bg-slate-50 p-4">
              <img
                src={getOptimizedImageUrl(viewingPhotoLoc.machinePhotoUrl || viewingPhotoLoc.ownerPhotoUrl || '', 1200, 1200)}
                alt={viewingPhotoLoc.name}
                className="w-full max-h-[70vh] object-contain rounded-[24px] border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SitesTab;

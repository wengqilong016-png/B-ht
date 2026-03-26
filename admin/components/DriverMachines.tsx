import React, { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Save, Loader2, Store, User, X } from 'lucide-react';
import type { Driver, Location } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

interface DriverMachinesProps {
  driver?: Driver;
  locations: Location[];
  drivers: Driver[];
  onBack: () => void;
  onUpdateLocations: (locations: Location[]) => void;
}

const DriverMachines: React.FC<DriverMachinesProps> = ({
  driver,
  locations,
  drivers,
  onBack,
  onUpdateLocations,
}) => {
  const assignedLocations = useMemo(
    () => (driver ? locations.filter(l => l.assignedDriverId === driver.id) : []),
    [driver, locations],
  );

  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({
    name: '',
    area: '',
    machineId: '',
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

  const handleEditLocation = (loc: Location) => {
    setEditingLoc(loc);
    setLocEditForm({
      name: loc.name,
      area: loc.area || '',
      machineId: loc.machineId || '',
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

  const handleSaveLocation = () => {
    if (!editingLoc) return;
    setIsSavingLoc(true);
    const rate = parseFloat(locEditForm.commissionRate) / 100;
    const parsedLastScore = parseInt(locEditForm.lastScore, 10);
    const updated: Location = {
      ...editingLoc,
      name: locEditForm.name,
      area: locEditForm.area,
      machineId: locEditForm.machineId,
      commissionRate: isNaN(rate) ? editingLoc.commissionRate : rate,
      lastScore: Number.isNaN(parsedLastScore) ? editingLoc.lastScore : parsedLastScore,
      status: locEditForm.status,
      ownerName: locEditForm.ownerName,
      shopOwnerPhone: locEditForm.shopOwnerPhone,
      assignedDriverId: locEditForm.assignedDriverId || undefined,
      initialStartupDebt: parseInt(locEditForm.initialStartupDebt) || 0,
      remainingStartupDebt: parseInt(locEditForm.remainingStartupDebt) || 0,
      isSynced: false,
    };
    onUpdateLocations(locations.map(l => l.id === updated.id ? updated : l));
    setIsSavingLoc(false);
    setEditingLoc(null);
  };

  if (!driver) return null;

  return (
    <>
      <div className="space-y-6 animate-in fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-indigo-600 shadow-sm transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm flex-shrink-0">
              <User size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">
                {driver.name}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {assignedLocations.length} machines assigned • {driver.phone}
              </p>
            </div>
          </div>
        </div>

        {assignedLocations.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Store size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-xs font-black uppercase">No machines assigned to this driver</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignedLocations.map(loc => (
              <div key={loc.id} className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-36 bg-slate-100 relative overflow-hidden">
                  {loc.machinePhotoUrl ? (
                    <img src={getOptimizedImageUrl(loc.machinePhotoUrl, 400, 400)} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-300">
                      <Store size={32} />
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">No Photo</span>
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-black uppercase backdrop-blur-sm ${loc.status === 'active' ? 'bg-emerald-500/80 text-white' : loc.status === 'maintenance' ? 'bg-amber-500/80 text-white' : 'bg-rose-500/80 text-white'}`}>{loc.status}</div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 leading-tight uppercase tracking-wide">{loc.machineId || '—'}</p>
                      {loc.area && <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{loc.area}</p>}
                      <p className="text-[9px] font-bold text-slate-500 mt-0.5 truncate">{loc.name}</p>
                    </div>
                    <button onClick={() => handleEditLocation(loc)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl transition-colors">
                      <Pencil size={13} />
                    </button>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Location Edit Modal — reuses the same pattern as SitesTab */}
      {editingLoc && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" role="dialog" aria-modal="true" aria-labelledby="edit-location-title">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white"><Store size={18} /></div>
                <div>
                  <h3 id="edit-location-title" className="text-base font-black text-slate-900 uppercase">Edit Location</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{editingLoc.machineId}</p>
                </div>
              </div>
              <button onClick={() => setEditingLoc(null)} aria-label="Close dialog" className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X size={18} /></button>
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
    </>
  );
};

export default DriverMachines;

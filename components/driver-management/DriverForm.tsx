import React from 'react';
import {
  User, Phone, Save, X, Truck,
  ShieldCheck, Percent, Loader2,
  Banknote, Receipt, Coins, MapPin, ToggleLeft, ToggleRight
} from 'lucide-react';
import { Location } from '../../types';
import InputField from './InputField';

export interface DriverFormState {
  name: string;
  username: string;
  email: string;
  password: string;
  phone: string;
  model: string;
  plate: string;
  dailyFloatingCoins: string;
  initialDebt: string;
  remainingDebt: string;
  baseSalary: string;
  commissionRate: string;
  status: 'active' | 'inactive';
}

interface DriverFormProps {
  isOpen: boolean;
  editingId: string | null;
  form: DriverFormState;
  isSaving: boolean;
  locations?: Location[];
  assignedLocationIds?: string[];
  onChange: (updates: Partial<DriverFormState>) => void;
  onLocationToggle?: (locationId: string) => void;
  onSave: () => void;
  onClose: () => void;
}

const DriverForm: React.FC<DriverFormProps> = ({
  isOpen, editingId, form, isSaving, locations = [], assignedLocationIds = [],
  onChange, onLocationToggle, onSave, onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white"><User size={20} /></div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{editingId ? 'Edit Driver' : 'New Driver'}</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <InputField label="姓名 NAME" value={form.name} icon={<User size={16} />} onChange={v => onChange({ name: v })} />
            <InputField label="电话 PHONE" value={form.phone} icon={<Phone size={16} />} onChange={v => onChange({ phone: v })} />
          </div>
          <div>
            <InputField label="登录账号 USERNAME" value={form.username} icon={<ShieldCheck size={16} />} onChange={v => onChange({ username: v })} />
          </div>

          {/* Email + Password — new driver only */}
          {!editingId && (
            <div className="p-5 bg-amber-50/50 rounded-[28px] border border-amber-100 space-y-4">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">登录账号配置 Login Credentials</p>
              <div>
                <InputField label="邮箱 EMAIL *" value={form.email} icon={<ShieldCheck size={16} />} onChange={v => onChange({ email: v })} />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase ml-1">初始密码 PASSWORD *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => onChange({ password: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-amber-400"
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          {/* Status toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[20px] border border-slate-200">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">账号状态 Account Status</p>
              <p className="text-xs font-bold text-slate-700 mt-0.5">
                {form.status === 'active' ? '在职 Active' : '停职 Inactive'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ status: form.status === 'active' ? 'inactive' : 'active' })}
              className={`transition-colors ${form.status === 'active' ? 'text-emerald-500' : 'text-slate-300'}`}
            >
              {form.status === 'active'
                ? <ToggleRight size={36} />
                : <ToggleLeft size={36} />
              }
            </button>
          </div>

          <div className="p-5 bg-slate-50 rounded-[28px] border border-slate-200 space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Truck size={14} /> Vehicle & Asset
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Vehicle Model</label>
                <input type="text" value={form.model} onChange={e => onChange({ model: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" placeholder="Bajaj / TVS" />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase ml-1">License Plate</label>
                <input type="text" value={form.plate} onChange={e => onChange({ plate: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold uppercase" placeholder="T 000 XXX" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Daily Coin Float</label>
              <input type="number" value={form.dailyFloatingCoins} onChange={e => onChange({ dailyFloatingCoins: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" />
            </div>
          </div>

          <div className="p-5 bg-indigo-50/50 rounded-[28px] border border-indigo-100 space-y-4">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Receipt size={14} /> 薪资与提成方案
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">Monthly Base Salary (TZS)</label>
                <div className="relative">
                  <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" />
                  <input type="number" value={form.baseSalary} onChange={e => onChange({ baseSalary: e.target.value })} className="w-full bg-white border border-indigo-100 rounded-xl pl-9 pr-4 py-3 text-sm font-black text-indigo-600 outline-none" placeholder="300000" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">提成比例 (%)</label>
                <div className="relative">
                  <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" />
                  <input type="number" value={form.commissionRate} onChange={e => onChange({ commissionRate: e.target.value })} className="w-full bg-white border border-indigo-100 rounded-xl pl-9 pr-4 py-3 text-sm font-black text-indigo-600 outline-none" placeholder="5" />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">初始欠款 Initial Debt</label>
              <input type="number" value={form.initialDebt} onChange={e => onChange({ initialDebt: e.target.value })} className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2.5 text-xs font-bold" />
            </div>
            {editingId && (
              <div className="space-y-1">
                <label className="text-[8px] font-black text-rose-400 uppercase ml-1">当前欠款 Current Debt (可修改)</label>
                <div className="relative">
                  <Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-300" />
                  <input type="number" value={form.remainingDebt} onChange={e => onChange({ remainingDebt: e.target.value })} className="w-full bg-white border border-rose-100 rounded-xl pl-9 pr-4 py-3 text-sm font-black text-rose-600 outline-none" placeholder="0" />
                </div>
              </div>
            )}
          </div>

          {/* Location assignment */}
          {editingId && locations.length > 0 && onLocationToggle && (
            <div className="p-5 bg-emerald-50/50 rounded-[28px] border border-emerald-100 space-y-3">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                <MapPin size={14} /> 分配机器点位 Assign Locations
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {locations.map(loc => {
                  const isAssigned = assignedLocationIds.includes(loc.id);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => onLocationToggle(loc.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        isAssigned
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-200 hover:bg-emerald-50/30'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        loc.status === 'active' ? 'bg-emerald-500' :
                        loc.status === 'maintenance' ? 'bg-amber-500' : 'bg-rose-400'
                      }`} />
                      <span className="text-[10px] font-black uppercase truncate flex-1">{loc.name}</span>
                      <span className="text-[8px] font-bold text-slate-400 flex-shrink-0">{loc.area}</span>
                      {isAssigned && <span className="text-[8px] font-black text-emerald-600 flex-shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[8px] font-bold text-emerald-500">
                {assignedLocationIds.length} location(s) assigned to this driver
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full bg-indigo-600 text-white rounded-2xl font-black py-4 uppercase shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:bg-slate-300 transition-all active:scale-95"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isSaving ? 'Saving...' : 'Save Driver Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverForm;

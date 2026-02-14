
import React, { useState } from 'react';
import { 
  Truck, User, Phone, Key, Save, X, Plus, Ban, 
  CheckCircle2, Pencil, Trash2, Banknote, Wallet, 
  Coins, CreditCard, UserCog, AlertCircle, ShieldCheck,
  TrendingDown, Percent, CircleDollarSign, Power, Navigation, Clock, MapPin, Loader2
} from 'lucide-react';
import { Driver, Transaction } from '../types';

interface DriverManagementProps {
  drivers: Driver[];
  transactions: Transaction[];
  onUpdateDrivers: (drivers: Driver[]) => void;
}

const DriverManagement: React.FC<DriverManagementProps> = ({ drivers, transactions, onUpdateDrivers }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [salaryId, setSalaryId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    model: '',
    plate: '',
    dailyFloatingCoins: '10000', 
    initialDebt: '0',
    baseSalary: '300000',
    commissionRate: '5'
  });

  const resetForm = () => {
    setForm({
      name: '', username: '', password: '', phone: '',
      model: '', plate: '', dailyFloatingCoins: '10000', initialDebt: '0',
      baseSalary: '300000', commissionRate: '5'
    });
    setEditingId(null);
    setIsFormOpen(false);
  };

  const openEdit = (d: Driver) => {
    setForm({
      name: d.name || '',
      username: d.username || '',
      password: d.password || '',
      phone: d.phone || '',
      model: d.vehicleInfo?.model || '',
      plate: d.vehicleInfo?.plate || '',
      dailyFloatingCoins: (d.dailyFloatingCoins ?? 10000).toString(),
      initialDebt: (d.initialDebt ?? 0).toString(),
      baseSalary: (d.baseSalary ?? 300000).toString(),
      commissionRate: ((d.commissionRate ?? 0.05) * 100).toString()
    });
    setEditingId(d.id);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.username) {
      alert("请填写姓名和账号 (Name and ID are required)");
      return;
    }

    setIsSaving(true);
    // Simulate brief processing for production feel
    await new Promise(r => setTimeout(r, 400));

    const parseNum = (str: string) => {
        const cleanStr = str.replace(/,/g, '').trim();
        const num = parseInt(cleanStr);
        return isNaN(num) ? 0 : num;
    };

    const parsedBaseSalary = parseNum(form.baseSalary);
    const parsedCommRate = parseFloat(form.commissionRate);

    const driverData = {
      name: form.name,
      username: form.username,
      password: form.password,
      phone: form.phone,
      dailyFloatingCoins: parseNum(form.dailyFloatingCoins),
      initialDebt: parseNum(form.initialDebt),
      vehicleInfo: { model: form.model, plate: form.plate },
      baseSalary: parsedBaseSalary === 0 ? 300000 : parsedBaseSalary,
      commissionRate: (isNaN(parsedCommRate) ? 5 : parsedCommRate) / 100
    };

    if (editingId) {
      onUpdateDrivers(drivers.map(d => d.id === editingId ? { ...d, ...driverData } : d));
    } else {
      const newDriver: Driver = {
        id: `D-${Date.now()}`,
        ...driverData,
        remainingDebt: driverData.initialDebt,
        status: 'active'
      };
      onUpdateDrivers([...drivers, newDriver]);
    }
    
    setIsSaving(false);
    resetForm();
  };

  const toggleStatus = (id: string) => {
    onUpdateDrivers(drivers.map(d => d.id === id ? { ...d, status: d.status === 'active' ? 'inactive' : 'active' } : d));
  };

  const calculateSalary = (id: string) => {
    const driver = drivers.find(d => d.id === id);
    if (!driver) return null;
    const txs = transactions.filter(t => t.driverId === id);
    const revenue = txs.reduce((sum, t) => sum + t.revenue, 0);
    const expenses = txs.reduce((sum, t) => sum + t.expenses, 0);
    const base = driver.baseSalary ?? 300000;
    const rate = driver.commissionRate ?? 0.05;
    const comm = Math.floor(revenue * rate);
    const debt = Math.min(driver.remainingDebt, Math.floor((base + comm) * 0.2));
    
    return { driver, revenue, expenses, base, comm, debt, rate, total: base + comm - debt };
  };

  const salaryData = salaryId ? calculateSalary(salaryId) : null;

  return (
    <div className="space-y-6 animate-in fade-in">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm gap-4">
         <div className="flex items-center gap-4">
           <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
             <UserCog size={24} />
           </div>
           <div>
             <h2 className="text-xl font-black text-slate-900">车队管理 (Fleet)</h2>
             <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Profiles, Vehicles & Payroll</p>
           </div>
         </div>
         <button onClick={() => { resetForm(); setIsFormOpen(true); }} className="px-5 py-3 rounded-xl font-black text-xs uppercase flex items-center gap-2 shadow-lg bg-slate-900 text-white hover:bg-slate-800 transition-all active:scale-95">
           <Plus size={16} /> 注册新司机 (Sajili)
         </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drivers.map(driver => (
            <div key={driver.id} className={`bg-white p-6 rounded-[32px] border shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${driver.status === 'inactive' ? 'opacity-75 grayscale bg-slate-50' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${driver.status === 'active' ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900">{driver.name}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase mt-1">
                      <Truck size={12} /> {driver.vehicleInfo?.model || '---'} • <span className="text-slate-900">{driver.vehicleInfo?.plate || '---'}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleStatus(driver.id)} className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border transition-all ${driver.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                  {driver.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                 <StatBox label="DEBT" value={`TZS ${driver.remainingDebt.toLocaleString()}`} color="text-rose-600" />
                 <StatBox label="FLOAT" value={driver.dailyFloatingCoins.toLocaleString()} color="text-slate-900" />
                 <StatBox label="BASE" value={(driver.baseSalary ?? 300000).toLocaleString()} color="text-slate-500" />
                 <StatBox label="COMM" value={`${((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%`} color="text-emerald-600" />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                 <button onClick={() => setSalaryId(driver.id)} className="py-3 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">
                   <Banknote size={14} /> 薪资单
                 </button>
                 <button onClick={() => openEdit(driver)} className="py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-md">
                   <Pencil size={14} /> 编辑
                 </button>
              </div>
            </div>
          ))}
       </div>

       {isFormOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 className="text-lg font-black text-slate-900">{editingId ? '编辑资料' : '注册司机'}</h3>
               <button onClick={resetForm} className="p-2 bg-white rounded-full text-slate-400 shadow-sm"><X size={18} /></button>
             </div>
             
             <div className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                   <InputField label="姓名 (Jina)" value={form.name} icon={<User size={16}/>} onChange={v => setForm({...form, name: v})} />
                   <InputField label="电话 (Simu)" value={form.phone} icon={<Phone size={16}/>} onChange={v => setForm({...form, phone: v})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <InputField label="账号 (ID)" value={form.username} icon={<ShieldCheck size={16}/>} onChange={v => setForm({...form, username: v})} />
                   <InputField label="密码 (Pass)" value={form.password} icon={<Key size={16}/>} onChange={v => setForm({...form, password: v})} type="password" />
                </div>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">车辆信息</p>
                   <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="bg-white border border-indigo-100 rounded-xl px-3 py-2.5 text-xs font-bold" placeholder="Model" />
                      <input type="text" value={form.plate} onChange={e => setForm({...form, plate: e.target.value})} className="bg-white border border-indigo-100 rounded-xl px-3 py-2.5 text-xs font-bold uppercase" placeholder="Plate" />
                   </div>
                </div>
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                   <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">薪资方案</p>
                   <div className="grid grid-cols-2 gap-3">
                      <input type="number" value={form.baseSalary} onChange={e => setForm({...form, baseSalary: e.target.value})} className="bg-white border border-emerald-100 rounded-xl px-3 py-2.5 text-xs font-bold" placeholder="Base" />
                      <input type="number" value={form.commissionRate} onChange={e => setForm({...form, commissionRate: e.target.value})} className="bg-white border border-emerald-100 rounded-xl px-3 py-2.5 text-xs font-bold" placeholder="Comm %" />
                   </div>
                </div>
             </div>

             <div className="p-6 border-t border-slate-100 bg-slate-50">
               <button 
                 onClick={handleSave} 
                 disabled={isSaving}
                 className="w-full bg-indigo-600 text-white rounded-xl font-black py-4 uppercase shadow-xl flex items-center justify-center gap-2 disabled:bg-slate-300 transition-all"
               >
                 {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                 {isSaving ? '正在保存...' : '保存档案 (SAVE)'}
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

const StatBox = ({ label, value, color }: any) => (
  <div className="p-3 rounded-xl border border-slate-100">
    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{label}</p>
    <p className={`text-[11px] font-black ${color}`}>{value}</p>
  </div>
);

const InputField = ({ label, value, onChange, icon, type = "text" }: any) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{label}</label>
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
      <span className="text-slate-400 mr-2">{icon}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="bg-transparent w-full text-xs font-bold outline-none" />
    </div>
  </div>
);

export default DriverManagement;

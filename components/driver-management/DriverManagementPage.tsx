import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Driver, Location } from '../../types';
import { createDriverAccount, persistDriverBusinessFields } from '../../services/driverManagementService';
import { useDriverManagement } from './hooks/useDriverManagement';
import DriverSalaryModal from './DriverSalaryModal';
import DriverToolbar, { SortField } from './DriverToolbar';
import DriverGrid from './DriverGrid';
import DriverAnalytics from './DriverAnalytics';
import DriverForm, { DriverFormState } from './DriverForm';
import { DriverWithStats } from './hooks/useDriverManagement';
import { useAppData } from '../../contexts/DataContext';
import { useMutations } from '../../contexts/MutationContext';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DriverManagementProps {}

const DEFAULT_FORM: DriverFormState = {
  name: '', username: '', email: '', password: '', phone: '',
  model: '', plate: '', dailyFloatingCoins: '10000',
  initialDebt: '0', remainingDebt: '0', baseSalary: '300000', commissionRate: '5',
  status: 'active'
};

const DriverManagementPage: React.FC<DriverManagementProps> = () => {
  const { filteredDrivers: drivers, locations, filteredTransactions: transactions, filteredSettlements: dailySettlements, isOnline } = useAppData();
  const { updateDrivers, updateLocations, deleteDrivers } = useMutations();

  const onUpdateDrivers = (driversToSave: Driver[]) => updateDrivers.mutateAsync(driversToSave).then(() => {});
  const onUpdateLocations = (locationsToSave: Location[]) => updateLocations.mutateAsync(locationsToSave).then(() => {});
  const onDeleteDrivers = (ids: string[]) => deleteDrivers.mutate(ids);
  const [viewMode, setViewMode] = useState<'grid' | 'analytics'>('grid');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [salaryId, setSalaryId] = useState<string | null>(null);
  const [pendingLocationIds, setPendingLocationIds] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = viewMode === 'grid' ? 9 : 12;

  const [form, setForm] = useState<DriverFormState>(DEFAULT_FORM);

  const { driversWithStats, fleetStats } = useDriverManagement(drivers, transactions);

  const processedDrivers = useMemo(() => {
    let result = [...driversWithStats];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.username.toLowerCase().includes(q) ||
        d.phone.includes(q)
      );
    }

    result.sort((a, b) => {
      let valA: any, valB: any;
      switch (sortBy) {
        case 'name': valA = a.name; valB = b.name; break;
        case 'revenue': valA = a.stats.totalRevenue; valB = b.stats.totalRevenue; break;
        case 'debt': valA = a.remainingDebt; valB = b.remainingDebt; break;
        case 'status': valA = a.status; valB = b.status; break;
        default: valA = a.stats.totalRevenue; valB = b.stats.totalRevenue;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [driversWithStats, searchTerm, sortBy, sortDir]);

  const totalPages = Math.ceil(processedDrivers.length / ITEMS_PER_PAGE);
  const paginatedDrivers = processedDrivers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => setPage(1), [searchTerm, sortBy, sortDir, viewMode]);

  const toggleSort = (key: SortField) => {
    if (sortBy === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setPendingLocationIds([]);
    setIsFormOpen(false);
  };

  const openEdit = (d: DriverWithStats) => {
    setForm({
      name: d.name || '',
      username: d.username || '',
      email: '',
      password: '',
      phone: d.phone || '',
      model: d.vehicleInfo?.model || '',
      plate: d.vehicleInfo?.plate || '',
      dailyFloatingCoins: (d.dailyFloatingCoins ?? 10000).toString(),
      initialDebt: (d.initialDebt ?? 0).toString(),
      remainingDebt: (d.remainingDebt ?? 0).toString(),
      baseSalary: (d.baseSalary ?? 300000).toString(),
      commissionRate: ((d.commissionRate ?? 0.05) * 100).toString(),
      status: d.status ?? 'active'
    });
    // Pre-populate assigned locations for this driver
    setPendingLocationIds(locations.filter(l => l.assignedDriverId === d.id).map(l => l.id));
    setEditingId(d.id);
    setIsFormOpen(true);
  };

  const handleLocationToggle = (locationId: string) => {
    setPendingLocationIds(prev =>
      prev.includes(locationId) ? prev.filter(id => id !== locationId) : [...prev, locationId]
    );
  };

  const handleSave = async () => {
    if (!form.name || !form.username) {
      alert("请填写姓名和账号 (Name and ID are required)");
      return;
    }

    setIsSaving(true);

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
      phone: form.phone,
      dailyFloatingCoins: parseNum(form.dailyFloatingCoins),
      initialDebt: parseNum(form.initialDebt),
      vehicleInfo: { model: form.model, plate: form.plate },
      baseSalary: parsedBaseSalary === 0 ? 300000 : parsedBaseSalary,
      commissionRate: (isNaN(parsedCommRate) ? 5 : parsedCommRate) / 100,
      status: form.status
    };

    if (editingId) {
      // ── Edit existing driver ──────────────────────────────────────────
      try {
        const remainingDebt = parseNum(form.remainingDebt);
        const updatedDrivers = drivers.map(d => d.id === editingId ? { ...d, ...driverData, remainingDebt } : d);
        const updatedLocations = locations.map(loc => {
          if (pendingLocationIds.includes(loc.id)) {
            return { ...loc, assignedDriverId: editingId };
          }
          if (loc.assignedDriverId === editingId) {
            const { assignedDriverId: _removed, ...rest } = loc;
            return rest as typeof loc;
          }
          return loc;
        });
        await Promise.all([
          onUpdateDrivers(updatedDrivers),
          onUpdateLocations(updatedLocations),
        ]);
        resetForm();
      } catch (error) {
        console.error('Failed to save driver assignment changes.', error);
        alert('保存司机资料失败，请重试。\nFailed to save driver changes. Please retry.');
      } finally {
        setIsSaving(false);
      }
    } else {
      // ── Create new driver via Edge Function ───────────────────────────
      const email = form.email.trim();
      const password = form.password;

      if (!email || !password) {
        alert("新建司机必须填写邮箱和初始密码\nEmail and password are required for new drivers");
        setIsSaving(false);
        return;
      }
      if (password.length < 8) {
        alert("密码至少 8 位 / Password must be at least 8 characters");
        setIsSaving(false);
        return;
      }

      try {
        const result = await createDriverAccount({
          email,
          password,
          username: form.username,
          name: form.name,
        });

        if (result.success === false) {
          if (result.code === 'EMAIL_CONFLICT') {
            alert(`邮箱已被注册 / Email already registered: ${email}`);
          } else if (result.code === 'DRIVER_ID_CONFLICT') {
            alert(`司机账号已存在 / Driver ID already exists: ${form.username}`);
          } else {
            alert(`创建司机失败 / Failed to create driver: ${result.message}`);
          }
          setIsSaving(false);
          return;
        }

        // Edge Function created Auth user + drivers row + profiles row.
        // Persist business fields that the Edge Function doesn't handle.
        const createdDriverId = result.driverId;
        try {
          await persistDriverBusinessFields(createdDriverId, driverData);
        } catch (updateErr) {
          console.error('Failed to persist business fields for new driver:', updateErr);
          alert('司机账号已创建，但部分业务信息未能保存。请重新编辑司机资料。\nDriver account created, but some business fields could not be saved. Please re-edit the driver profile.');
        }

        // Merge the new driver into local state so the UI updates immediately.
        const newDriver: Driver = {
          id: createdDriverId,
          ...driverData,
          remainingDebt: driverData.initialDebt,
        };
        await onUpdateDrivers([...drivers, newDriver]);
        resetForm();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(`创建司机失败 / Failed to create driver: ${msg}`);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeleteDriver = (id: string) => {
    if (!isOnline) {
      alert('网络离线时无法删除司机账号。请联网后重试。\nCannot delete driver while offline. Please reconnect and try again.');
      return;
    }
    if (!window.confirm('确认删除此司机账户？此操作将永久删除登录凭据及所有关联数据，不可撤销。\nDelete this driver? This will permanently remove their login credentials. This cannot be undone.')) return;
    if (onDeleteDrivers) {
      onDeleteDrivers([id]);
    } else {
      onUpdateDrivers(drivers.filter(d => d.id !== id));
    }
  };

  const toggleStatus = (id: string) => {
    if (confirm("Confirm status change?")) {
      onUpdateDrivers(drivers.map(d => d.id === id ? { ...d, status: d.status === 'active' ? 'inactive' : 'active' } : d));
    }
  };

  const calculateSalary = (id: string) => {
    const driver = drivers.find(d => d.id === id);
    if (!driver) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthTxs = transactions.filter(t => {
      const txDate = new Date(t.timestamp);
      return t.driverId === id &&
        t.type === 'collection' &&
        t.paymentStatus === 'paid' &&
        txDate.getMonth() === currentMonth &&
        txDate.getFullYear() === currentYear;
    });
    const currentMonthSettlements = dailySettlements.filter(s => {
      const settlementDate = new Date(s.date);
      return s.driverId === id &&
        s.status === 'confirmed' &&
        settlementDate.getMonth() === currentMonth &&
        settlementDate.getFullYear() === currentYear;
    });

    const revenue = currentMonthSettlements.reduce((sum, s) => sum + s.totalRevenue, 0);
    const loans = currentMonthTxs.reduce((sum, t) => sum + (t.expenseType === 'private' ? t.expenses : 0), 0);
    const base = driver.baseSalary ?? 300000;
    const rate = driver.commissionRate ?? 0.05;
    const comm = Math.floor(revenue * rate);
    const shortage = currentMonthSettlements.reduce((sum, s) => sum + (s.shortage < 0 ? Math.abs(s.shortage) : 0), 0);
    const totalDeductions = loans + shortage;

    return {
      driver,
      revenue, loans, shortage, base, comm, rate,
      txCount: currentMonthTxs.length,
      month: now.toLocaleString('zh-CN', { month: 'long' }),
      total: base + comm - totalDeductions
    };
  };

  const salaryData = salaryId ? calculateSalary(salaryId) : null;

  return (
    <div className="space-y-6 animate-in fade-in">
      {salaryId && salaryData && (
        <DriverSalaryModal salaryData={salaryData} onClose={() => setSalaryId(null)} />
      )}

      <DriverToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortDir={sortDir}
        setSortDir={setSortDir}
        onAddNew={() => { resetForm(); setIsFormOpen(true); }}
      />

      {viewMode === 'grid' && (
        <DriverGrid
          paginatedDrivers={paginatedDrivers}
          driversWithStats={driversWithStats}
          onEdit={openEdit}
          onDelete={handleDeleteDriver}
          onToggleStatus={toggleStatus}
          onShowSalary={setSalaryId}
        />
      )}

      {viewMode === 'analytics' && (
        <DriverAnalytics
          fleetStats={fleetStats}
          paginatedDrivers={paginatedDrivers}
          sortBy={sortBy}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onEdit={openEdit}
          onDelete={handleDeleteDriver}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <DriverForm
        isOpen={isFormOpen}
        editingId={editingId}
        form={form}
        isSaving={isSaving}
        locations={locations}
        assignedLocationIds={pendingLocationIds}
        onChange={updates => setForm(prev => ({ ...prev, ...updates }))}
        onLocationToggle={handleLocationToggle}
        onSave={handleSave}
        onClose={resetForm}
      />
    </div>
  );
};

export default DriverManagementPage;

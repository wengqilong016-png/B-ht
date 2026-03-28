/**
 * AdminManagement
 * ──────────────────────────────────────────────────────────────────────────────
 * Admin panel for managing administrator accounts.
 *
 * Provides:
 *   • List of admin profiles (newest-first) with display name and creation time
 *   • "新增管理员 / New Admin" button that expands a creation form
 *   • Create form: email, password (≥8 chars), display name
 *   • Calls the `create-admin` Edge Function to provision the new admin
 *   • Success / error feedback inline
 *
 * Data source: `profiles` table filtered by role = 'admin'.
 * Auto-refreshes after successful creation; manual Refresh button provided.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface AdminProfile {
  auth_user_id: string;
  display_name: string | null;
  created_at: string | null;
}

const AdminManagement: React.FC = () => {
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('auth_user_id, display_name, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdmins((data as AdminProfile[]) ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleCreate = useCallback(async () => {
    setCreateError(null);
    setCreateSuccess(null);

    const trimmedEmail = email.trim();
    const trimmedDisplay = displayName.trim();

    if (!trimmedEmail) {
      setCreateError('邮箱不能为空 / Email is required');
      return;
    }
    if (!password) {
      setCreateError('密码不能为空 / Password is required');
      return;
    }
    if (password.length < 8) {
      setCreateError('密码至少 8 位 / Password must be at least 8 characters');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: {
          email: trimmedEmail,
          password,
          display_name: trimmedDisplay || undefined,
        },
      });

      if (error || !data?.success) {
        const msg: string = data?.error ?? error?.message ?? 'Unknown error';
        if (data?.code === 'EMAIL_CONFLICT' || msg.toLowerCase().includes('conflict')) {
          setCreateError(`邮箱已注册 / Email already registered: ${trimmedEmail}`);
        } else {
          setCreateError(`创建失败 / Creation failed: ${msg}`);
        }
        return;
      }

      setCreateSuccess(
        `管理员账号已创建 / Admin account created: ${data.display_name ?? trimmedDisplay} (${trimmedEmail})`,
      );
      setEmail('');
      setPassword('');
      setDisplayName('');
      setShowCreateForm(false);
      fetchAdmins();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [email, password, displayName, fetchAdmins]);

  const handleCancelCreate = useCallback(() => {
    setShowCreateForm(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
    setCreateError(null);
    setCreateSuccess(null);
  }, []);

  const handleToggleCreateForm = useCallback(() => {
    setCreateSuccess(null);
    setShowCreateForm((prev) => !prev);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              管理员管理 / Admin Management
            </h2>
            {!loading && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase">
                {admins.length} admin{admins.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xl leading-relaxed">
            查看并创建管理员账号。新管理员可立即登录。
            <br />
            View and create administrator accounts. New admins can log in immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleCreateForm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors"
          >
            {showCreateForm ? <X size={14} /> : <Plus size={14} />}
            {showCreateForm ? '取消 / Cancel' : '新增管理员 / New Admin'}
          </button>
          <button
            onClick={fetchAdmins}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新 / Refresh
          </button>
        </div>
      </div>

      {/* ── Success banner ──────────────────────────────────────────────────── */}
      {createSuccess && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>{createSuccess}</span>
          <button
            onClick={() => setCreateSuccess(null)}
            className="ml-auto shrink-0 text-emerald-500 hover:text-emerald-700"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
            新增管理员账号 / Create Admin Account
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                邮箱 / Email *
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                密码 / Password * (≥8位)
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位 / At least 8 characters"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                显示名称 / Display Name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Admin（可选 / optional）"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
          </div>

          {createError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">
              {createError}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating || !email.trim() || !password}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {creating ? '创建中… / Creating…' : '创建管理员 / Create Admin'}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={creating}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-colors disabled:opacity-50"
            >
              取消 / Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Admin list ──────────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          加载失败 / Load error: {fetchError}
        </div>
      )}

      {loading && !fetchError ? (
        <div className="flex items-center gap-2 py-8 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          <span>加载中… / Loading…</span>
        </div>
      ) : !loading && admins.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-8 text-center text-slate-400 text-xs">
          暂无管理员记录 / No admin accounts found
        </div>
      ) : (
        <div className="space-y-2">
          {admins.map((admin) => (
            <div
              key={admin.auth_user_id}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white"
            >
              <ShieldCheck size={16} className="text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {admin.display_name ?? '—'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {admin.auth_user_id}
                </p>
              </div>
              {admin.created_at && (
                <span className="shrink-0 text-[10px] text-slate-400">
                  {new Date(admin.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminManagement;

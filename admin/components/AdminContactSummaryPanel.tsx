import {
  Users, Phone, X, Copy, CheckCheck, MessageSquare, Send,
  Loader2, ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import React, { useMemo, useState, useCallback } from 'react';

import { useToast } from '../../contexts/ToastContext';
import supabase from '../../supabaseClient';

import type { Driver, Location } from '../../types/models';

interface ContactGroup {
  driverId: string;
  driverName: string;
  driverPhone: string;
  locations: Array<{ id: string; name: string; ownerName: string; phone: string }>;
}

interface AdminContactSummaryPanelProps {
  locations: Location[];
  drivers: Driver[];
  lang: 'zh' | 'sw';
}

function buildContactGroups(locations: Location[], drivers: Driver[], lang: 'zh' | 'sw'): ContactGroup[] {
  const driverMap = new Map(drivers.map(d => [d.id, d]));

  // Group locations by assignedDriverId
  const grouped = new Map<string, Location[]>();
  const unassigned: Location[] = [];
  for (const loc of locations) {
    if (loc.assignedDriverId) {
      const existing = grouped.get(loc.assignedDriverId) ?? [];
      existing.push(loc);
      grouped.set(loc.assignedDriverId, existing);
    } else {
      unassigned.push(loc);
    }
  }

  const groups: ContactGroup[] = [];

  for (const [driverId, locs] of grouped.entries()) {
    const driver = driverMap.get(driverId);
    groups.push({
      driverId,
      driverName: driver?.name ?? driverId,
      driverPhone: driver?.phone ?? '',
      locations: locs
        .filter(l => l.shopOwnerPhone || l.ownerName)
        .map(l => ({
          id: l.id,
          name: l.name,
          ownerName: l.ownerName ?? '—',
          phone: l.shopOwnerPhone ?? '',
        })),
    });
  }

  if (unassigned.some(l => l.shopOwnerPhone)) {
    groups.push({
      driverId: '__unassigned__',
      driverName: lang === 'zh' ? '未分配司机' : 'Unassigned Driver',
      driverPhone: '',
      locations: unassigned
        .filter(l => l.shopOwnerPhone || l.ownerName)
        .map(l => ({
          id: l.id,
          name: l.name,
          ownerName: l.ownerName ?? '—',
          phone: l.shopOwnerPhone ?? '',
        })),
    });
  }

  return groups.filter(g => g.locations.length > 0);
}

interface SMSComposeProps {
  phones: string[];
  onClose: () => void;
  lang: 'zh' | 'sw';
}

const SMSCompose: React.FC<SMSComposeProps> = ({ phones, onClose, lang }) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const { showToast } = useToast();

  const validPhones = phones.filter(Boolean);

  const handleSend = async () => {
    if (!message.trim() || validPhones.length === 0) return;
    setIsSending(true);
    try {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : '';
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ phones: validPhones, message: message.trim() }),
      });
      const data = await res.json() as { sent?: number; failed?: number; error?: string };
      if (!res.ok || data.error) {
        showToast(data.error ?? (lang === 'zh' ? '发送失败' : 'Send failed'), 'error');
      } else {
        setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
        showToast(
          lang === 'zh' ? `已发送 ${data.sent} 条，失败 ${data.failed} 条` : `Sent ${data.sent}, failed ${data.failed}`,
          (data.failed ?? 0) > 0 ? 'warning' : 'success',
        );
      }
    } catch {
      showToast(lang === 'zh' ? '网络错误，请检查连接' : 'Network error', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-caption font-black uppercase text-slate-500 tracking-widest">
          {lang === 'zh' ? `编写短信（${validPhones.length} 个号码）` : `Compose SMS (${validPhones.length} numbers)`}
        </p>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400">
          <X size={14} />
        </button>
      </div>

      {result ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-subcard p-3 text-caption font-bold text-emerald-700">
          {lang === 'zh' ? `发送完成：${result.sent} 成功，${result.failed} 失败` : `Done: ${result.sent} sent, ${result.failed} failed`}
        </div>
      ) : (
        <>
          <textarea
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={lang === 'zh' ? '输入短信内容…（支持中英文）' : 'Type your SMS message…'}
            className="w-full text-sm rounded-subcard border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-amber-400 resize-none"
            maxLength={500}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-slate-400 font-bold">{message.length}/500</span>
            <button
              onClick={handleSend}
              disabled={isSending || !message.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-btn text-caption font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-700 transition-colors"
            >
              {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {lang === 'zh' ? '群发' : 'Send All'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface ContactGroupCardProps {
  group: ContactGroup;
  lang: 'zh' | 'sw';
}

const ContactGroupCard: React.FC<ContactGroupCardProps> = ({ group, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSMS, setShowSMS] = useState(false);
  const { showToast } = useToast();

  const locationPhones = useMemo(() => {
    const phones = new Set<string>();
    group.locations.forEach(l => {
      if (l.phone) phones.add(l.phone);
    });
    return Array.from(phones);
  }, [group.locations]);

  const allPhones = useMemo(
    () => locationPhones,
    [locationPhones],
  );

  const handleCopyPhones = useCallback(() => {
    const text = locationPhones.join(',');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast(lang === 'zh' ? '号码已复制' : 'Phones copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      showToast(lang === 'zh' ? '复制失败，请手动复制' : 'Copy failed', 'error');
    });
  }, [locationPhones, showToast, lang]);

  const handleExport = useCallback(() => {
    const lines = group.locations
      .filter(l => l.phone)
      .map(l => `${l.ownerName}\t${l.phone}\t${l.name}`)
      .join('\n');
    const blob = new Blob([`${lang === 'zh' ? '姓名' : 'Name'}\t${lang === 'zh' ? '电话' : 'Phone'}\t${lang === 'zh' ? '点位' : 'Site'}\n${lines}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.driverName}-contacts.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [group, lang]);

  return (
    <div className="border border-slate-200 rounded-card overflow-hidden bg-white">
      {/* Group header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-subcard bg-gradient-to-br from-slate-800 to-amber-700 flex items-center justify-center flex-shrink-0">
          <Users size={14} className="text-white" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{group.driverName}</p>
          <p className="text-caption text-slate-400 font-bold">
            {group.locations.filter(l => l.phone).length} {lang === 'zh' ? '个联系人' : 'contacts'}
            {group.driverPhone && ` · ${group.driverPhone}`}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
      </button>

      {/* Actions row */}
      {locationPhones.length > 0 && (
        <div className="flex border-t border-slate-100">
          <button
            onClick={handleCopyPhones}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-caption font-black uppercase text-amber-700 hover:bg-amber-50 transition-colors"
          >
            {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
            {lang === 'zh' ? '复制号码' : 'Copy'}
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={handleExport}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-caption font-black uppercase text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download size={12} />
            {lang === 'zh' ? '导出' : 'Export'}
          </button>
          <div className="w-px bg-slate-100" />
          <button
            onClick={() => setShowSMS(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-caption font-black uppercase text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <MessageSquare size={12} />
            SMS
          </button>
        </div>
      )}

      {/* SMS compose */}
      {showSMS && (
        <SMSCompose phones={allPhones} onClose={() => setShowSMS(false)} lang={lang} />
      )}

      {/* Expanded location list */}
      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {group.locations.map(loc => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-7 h-7 rounded-tag bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Phone size={11} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{loc.ownerName}</p>
                <p className="text-caption text-slate-400 font-bold truncate">{loc.name}</p>
              </div>
              {loc.phone ? (
                <a
                  href={`tel:${loc.phone}`}
                  className="text-caption font-black text-amber-700 hover:underline flex-shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  {loc.phone}
                </a>
              ) : (
                <span className="text-caption text-slate-300 font-bold">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminContactSummaryPanel: React.FC<AdminContactSummaryPanelProps> = ({
  locations,
  drivers,
  lang,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showGlobalSMS, setShowGlobalSMS] = useState(false);

  const groups = useMemo(() => buildContactGroups(locations, drivers, lang), [locations, drivers, lang]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        locations: g.locations.filter(
          l => l.ownerName.toLowerCase().includes(q) || l.phone.includes(q) || l.name.toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.driverName.toLowerCase().includes(q) || g.locations.length > 0);
  }, [groups, search]);

  const allPhones = useMemo(
    () => Array.from(new Set(groups.flatMap(g => g.locations.map(l => l.phone).filter(Boolean)))),
    [groups],
  );

  const totalContacts = useMemo(
    () => groups.reduce((s, g) => s + g.locations.filter(l => l.phone).length, 0),
    [groups],
  );

  return (
    <>
      {/* FAB — positioned to left of AI assistant FAB */}
      <button
        onClick={() => setIsOpen(v => !v)}
        aria-label={lang === 'zh' ? '联系人汇总' : 'Contact Summary'}
        className="fixed bottom-20 right-20 z-40 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200 flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all md:bottom-6 md:right-20"
      >
        {isOpen ? <X size={18} /> : <Phone size={20} />}
        {!isOpen && totalContacts > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full text-caption font-black flex items-center justify-center border-2 border-white">
            {totalContacts > 99 ? '99+' : totalContacts}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
          {/* Mobile backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 pointer-events-auto md:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="relative pointer-events-auto w-full md:w-[420px] md:mr-20 md:mb-8 flex flex-col bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: 'min(90vh, 700px)' }}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-subcard bg-white/20 flex items-center justify-center">
                    <Phone size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">
                      {lang === 'zh' ? '联系人汇总' : 'Contact Summary'}
                    </p>
                    <p className="text-caption text-blue-200 font-bold">
                      {totalContacts} {lang === 'zh' ? '个联系人' : 'contacts'} · {groups.length} {lang === 'zh' ? '组' : 'groups'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowGlobalSMS(v => !v)}
                    className="p-2 rounded-subcard bg-white/15 text-white hover:bg-white/25 transition-colors"
                    title={lang === 'zh' ? '群发短信给所有联系人' : 'SMS all contacts'}
                  >
                    <MessageSquare size={14} />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-subcard bg-white/15 text-white hover:bg-white/25 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Search */}
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={lang === 'zh' ? '搜索姓名、电话、网点…' : 'Search name, phone, site…'}
                className="w-full bg-white/15 placeholder:text-blue-200 text-white text-xs font-bold rounded-subcard px-3 py-2 outline-none border border-white/20 focus:border-white/50"
              />
            </div>

            {/* Global SMS compose */}
            {showGlobalSMS && (
              <SMSCompose phones={allPhones} onClose={() => setShowGlobalSMS(false)} lang={lang} />
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                  <Phone size={32} className="opacity-30" />
                  <p className="text-sm font-bold">
                    {search ? (lang === 'zh' ? '无匹配结果' : 'No results') : (lang === 'zh' ? '暂无联系人信息' : 'No contacts yet')}
                  </p>
                  {!search && (
                    <p className="text-caption text-center text-slate-300 font-bold max-w-[200px]">
                      {lang === 'zh' ? '请先在网点管理中填写店主电话' : 'Add owner phones in Site Management first'}
                    </p>
                  )}
                </div>
              ) : (
                filteredGroups.map(group => (
                  <ContactGroupCard key={group.driverId} group={group} lang={lang} />
                ))
              )}
            </div>

            {/* Footer summary */}
            {totalContacts > 0 && !showGlobalSMS && (
              <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                <p className="text-caption text-slate-400 font-bold">
                  {lang === 'zh' ? `共 ${totalContacts} 个业主号码` : `${totalContacts} owner phones total`}
                </p>
                <button
                  onClick={() => setShowGlobalSMS(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-btn text-caption font-black uppercase hover:bg-blue-700 transition-colors"
                >
                  <MessageSquare size={11} />
                  {lang === 'zh' ? '全部群发' : 'Broadcast'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminContactSummaryPanel;

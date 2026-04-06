import React from 'react';
import { TRANSLATIONS } from '../../types';

type TabKey = 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';

interface DashboardTabsProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  isAdmin: boolean;
  lang: 'zh' | 'sw';
  hideTabs?: boolean;
}

const DashboardTabs: React.FC<DashboardTabsProps> = ({ activeTab, setActiveTab, isAdmin, lang, hideTabs }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className={`flex items-center gap-2 bg-[#f0f2f5] p-1.5 rounded-[20px] shadow-silicone-pressed overflow-x-auto scrollbar-hide mb-4 ${hideTabs ? 'hidden' : ''}`}>
      {isAdmin && (
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'overview' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {t.overviewLabel}
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('locations')}
          className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'locations' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {t.sitesLabel}
        </button>
      )}
      <button
        onClick={() => setActiveTab('settlement')}
        className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
          activeTab === 'settlement' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        {isAdmin ? t.approvalsLabel : t.dailySettlement}
      </button>
      {isAdmin && (
        <button
          onClick={() => setActiveTab('team')}
          className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'team' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {t.fleetLabel}
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('tracking')}
          className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'tracking' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {t.trackingLabel}
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('ai-logs')}
          className={`px-3 py-2 min-h-10 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'ai-logs' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          AI LOGS
        </button>
      )}
    </div>
  );
};

export default DashboardTabs;

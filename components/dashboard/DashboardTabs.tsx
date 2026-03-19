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
    <div className={`flex items-center gap-3 bg-[#f0f2f5] p-2 rounded-[24px] shadow-silicone-pressed overflow-x-auto scrollbar-hide mb-8 ${hideTabs ? 'hidden' : ''}`}>
      {isAdmin && (
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'overview' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          OVERVIEW
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('locations')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'locations' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          SITES
        </button>
      )}
      <button
        onClick={() => setActiveTab('settlement')}
        className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
          activeTab === 'settlement' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        {isAdmin ? 'APPROVE' : 'SETTLEMENT'}
      </button>
      {isAdmin && (
        <button
          onClick={() => setActiveTab('team')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'team' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          FLEET
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('tracking')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
            activeTab === 'tracking' ? 'bg-silicone-gradient text-indigo-600 shadow-silicone border border-white/60' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          TRACKING
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => setActiveTab('ai-logs')}
          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${
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

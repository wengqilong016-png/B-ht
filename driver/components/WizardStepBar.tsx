import { CheckCircle2 } from 'lucide-react';
import React from 'react';

// Step numbers start at 2 because step 1 (machine selection) has its own
// full-page layout without a progress bar.
const WIZARD_STEPS: Array<{ key: string; labelZh: string; labelSw: string }> = [
  { key: 'capture', labelZh: '拍照',  labelSw: 'Picha' },
  { key: 'amounts', labelZh: '金额',  labelSw: 'Fedha' },
  { key: 'confirm', labelZh: '提交',  labelSw: 'Wasilisha' },
];

interface WizardStepBarProps {
  current: string;
  lang: 'zh' | 'sw';
}

const WizardStepBar: React.FC<WizardStepBarProps> = ({ current, lang }) => {
  const currentIdx = WIZARD_STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = s.key === current;
        return (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-caption font-black uppercase transition-all ${
              active ? 'bg-indigo-600 text-white' :
              done    ? 'bg-emerald-100 text-emerald-600' :
                        'bg-slate-100 text-slate-400'
            }`}>
              {done ? <CheckCircle2 size={10} /> : <span>{i + 2}</span>}
              {lang === 'sw' ? s.labelSw : s.labelZh}
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WizardStepBar;

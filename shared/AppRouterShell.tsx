import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts';

const AppAdminShell = React.lazy(() => import('../admin/AppAdminShell'));
const AppDriverShell = React.lazy(() => import('../driver/AppDriverShell'));

const ShellFallback = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#f3f5f8]">
    <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading...</p>
  </div>
);

const AppRouterShell: React.FC = () => {
  const { currentUser } = useAuth();
  return (
    <Suspense fallback={<ShellFallback />}>
      {currentUser?.role === 'admin' ? <AppAdminShell /> : <AppDriverShell />}
    </Suspense>
  );
};

export default AppRouterShell;

import React from 'react';

interface ShellMainContentProps {
  children: React.ReactNode;
  /** Whether the shell has a fixed bottom nav that overlaps content (driver mobile) */
  hasBottomNav?: boolean;
}

/**
 * Consistent content wrapper for both admin and driver shells.
 * Handles safe-area-aware bottom padding and max-width.
 */
const ShellMainContent: React.FC<ShellMainContentProps> = ({
  children,
  hasBottomNav = false,
}) => (
  <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#f3f5f8]">
    <div
      className={`max-w-7xl mx-auto p-3 md:p-5 lg:p-6 ${
        hasBottomNav
          ? 'pb-[max(7rem,calc(var(--mobile-nav-height,4.5rem)+2rem+env(safe-area-inset-bottom)))] md:pb-[max(8rem,calc(var(--mobile-nav-height,4.5rem)+2.5rem+env(safe-area-inset-bottom)))] lg:pb-6'
          : 'pb-[max(7rem,calc(7rem+env(safe-area-inset-bottom)))] md:pb-5 lg:pb-6'
      }`}
    >
      {children}
    </div>
  </main>
);

export default ShellMainContent;

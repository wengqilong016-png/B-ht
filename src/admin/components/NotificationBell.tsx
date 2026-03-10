import React from 'react';
import { Bell } from 'lucide-react';
import { AppNotification } from '../../notifications/detectors';

interface Props {
  notifications: AppNotification[];
  onClick: () => void;
}

const NotificationBell: React.FC<Props> = ({ notifications, onClick }) => {
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <button 
      onClick={onClick}
      className="relative p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors focus:outline-none"
    >
      <Bell size={24} />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full px-1 shadow-sm border-2 border-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;

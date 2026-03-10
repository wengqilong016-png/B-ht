import React from 'react';
import { AppNotification } from '../../notifications/detectors';
import { X, AlertTriangle, Info, Bell, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onNavigate: (route: string) => void;
}

const NotificationDrawer: React.FC<Props> = ({ isOpen, onClose, notifications, onMarkAsRead, onNavigate }) => {
  if (!isOpen) return null;

  const getIcon = (level: string) => {
    switch (level) {
      case 'critical': return <AlertTriangle size={18} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={18} className="text-orange-500" />;
      default: return <Info size={18} className="text-blue-500" />;
    }
  };

  const getBadgeStyle = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2 text-slate-800">
            <Bell size={20} className="text-indigo-500" />
            <h2 className="text-base font-black tracking-tight">System Events</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CheckCircle2 size={32} className="mb-2 opacity-50" />
              <p className="text-sm font-bold">You are all caught up!</p>
            </div>
          ) : (
            notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(notif => (
              <div 
                key={notif.id}
                className={`p-4 rounded-2xl border transition-all ${notif.is_read ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-indigo-100 shadow-sm'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getIcon(notif.level)}
                    <span className="text-sm font-black text-slate-900 leading-tight">{notif.title}</span>
                  </div>
                  {!notif.is_read && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />}
                </div>
                
                <p className="text-xs font-medium text-slate-600 leading-snug mb-3">
                  {notif.message}
                </p>
                
                <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100/50">
                  <span className="text-[10px] font-bold text-slate-400">
                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex space-x-2">
                    {!notif.is_read && (
                      <button 
                        onClick={() => onMarkAsRead(notif.id)}
                        className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Mark Read
                      </button>
                    )}
                    {notif.route_target && (
                      <button 
                        onClick={() => {
                          onMarkAsRead(notif.id);
                          onNavigate(notif.route_target!);
                          onClose();
                        }}
                        className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${getBadgeStyle(notif.level)}`}
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationDrawer;

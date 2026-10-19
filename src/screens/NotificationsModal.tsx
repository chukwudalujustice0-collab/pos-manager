import { useEffect, useState } from 'react';
import { supabase, type AppNotification } from '@/lib/supabase';
import { Modal, LoadingSpinner, EmptyState, Button } from '@/components/ui';
import { formatDateTime, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Bell, Check } from 'lucide-react';

export function NotificationsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user?.id).eq('is_read', false);
    load();
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    load();
  };

  return (
    <Modal open={true} onClose={onClose} title="Notifications" size="md">
      <div className="space-y-3">
        {notifications.length > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="w-full">
            <Check className="h-4 w-4" /> Mark all as read
          </Button>
        )}
        {loading ? (
          <LoadingSpinner />
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell className="h-10 w-10" />} title="No notifications" subtitle="You're all caught up" />
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={classNames(
                  'flex w-full items-start gap-3 rounded-lg p-3 text-left',
                  n.is_read ? 'bg-white' : 'bg-purple-50'
                )}
              >
                {!n.is_read && <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-purple-600" />}
                <div className={classNames('flex-1', n.is_read && 'ml-5')}>
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

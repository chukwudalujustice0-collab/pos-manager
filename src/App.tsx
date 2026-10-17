import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AuthScreen } from '@/screens/AuthScreen';
import { AppShell, type NavTab } from '@/components/AppShell';
import { LoadingSpinner } from '@/components/ui';
import { Dashboard } from '@/screens/Dashboard';
import { InventoryScreen } from '@/screens/Inventory';
import { AgentsScreen } from '@/screens/Agents';
import { SalesScreen } from '@/screens/Sales';
import { MoreScreen } from '@/screens/More';
import { SearchModal } from '@/screens/SearchModal';
import { NotificationsModal } from '@/screens/NotificationsModal';
import { supabase, type AppNotification } from '@/lib/supabase';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<NavTab>('dashboard');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user, notifOpen]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthScreen />;
  }

  if (!profile.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <p className="text-lg font-semibold text-slate-800">Account Disabled</p>
        <p className="mt-2 text-sm text-slate-500">Your account has been disabled. Please contact the business owner.</p>
      </div>
    );
  }

  return (
    <>
      <AppShell
        active={tab}
        onNavigate={setTab}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNotifications={() => setNotifOpen(true)}
        unreadCount={unread}
      >
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'inventory' && <InventoryScreen />}
        {tab === 'agents' && <AgentsScreen />}
        {tab === 'sales' && <SalesScreen />}
        {tab === 'more' && <MoreScreen onNavigate={setTab} />}
      </AppShell>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {notifOpen && <NotificationsModal onClose={() => setNotifOpen(false)} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

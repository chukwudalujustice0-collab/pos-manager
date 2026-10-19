import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Boxes, Users, ShoppingCart, MoreHorizontal, Bell, LogOut, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { classNames } from '@/lib/utils';

export type NavTab = 'dashboard' | 'inventory' | 'agents' | 'sales' | 'more';

interface ShellProps {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
  children: ReactNode;
}

const TABS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export function AppShell({ active, onNavigate, onOpenSearch, onOpenNotifications, unreadCount, children }: ShellProps) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-800">
            <Boxes className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Wema Super Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSearch}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenNotifications}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
            >
              {(profile?.full_name ?? '?').slice(0, 1).toUpperCase()}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
                  <div className="px-4 py-2">
                    <p className="text-sm font-medium text-slate-800">{profile?.full_name}</p>
                    <p className="text-xs text-slate-400">{profile?.email}</p>
                    <span className="mt-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 capitalize">
                      {profile?.role.replace('_', ' ')}
                    </span>
                  </div>
                  <hr className="my-1 border-slate-100" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-4xl px-4 py-4">{children}</div>
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={classNames(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-purple-800' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <Icon className={classNames('h-5 w-5', isActive && 'stroke-[2.5]')} />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

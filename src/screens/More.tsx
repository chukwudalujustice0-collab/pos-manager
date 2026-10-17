import type { NavTab } from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui';
import { Package, ArrowLeftRight, Receipt, FileText, Shield, Settings as SettingsIcon, Users, ChevronRight, FileDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ReceiptsScreen } from '@/screens/Receipts';
import { TransfersScreen } from '@/screens/Transfers';
import { ReportsScreen } from '@/screens/Reports';
import { AuditScreen } from '@/screens/Audit';
import { SettingsScreen } from '@/screens/Settings';
import { CustomersScreen } from '@/screens/Customers';

type MoreView = 'menu' | 'receipts' | 'transfers' | 'reports' | 'audit' | 'settings' | 'customers';

export function MoreScreen({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [view, setView] = useState<MoreView>('menu');

  if (view === 'receipts') return <ReceiptsScreen onBack={() => setView('menu')} />;
  if (view === 'transfers') return <TransfersScreen onBack={() => setView('menu')} />;
  if (view === 'reports') return <ReportsScreen onBack={() => setView('menu')} />;
  if (view === 'audit') return <AuditScreen onBack={() => setView('menu')} />;
  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'customers') return <CustomersScreen onBack={() => setView('menu')} />;

  const items: { label: string; icon: LucideIcon; view: MoreView; desc: string; staffOnly?: boolean }[] = [
    { label: 'Receipts', icon: Receipt, view: 'receipts', desc: 'Stock received & batch history', staffOnly: true },
    { label: 'Transfers', icon: ArrowLeftRight, view: 'transfers', desc: 'Dispatch & delivery confirmations' },
    { label: 'Customers', icon: Users, view: 'customers', desc: 'Customer records' },
    { label: 'Reports', icon: FileText, view: 'reports', desc: 'Download CSV reports', staffOnly: true },
    { label: 'Audit Trail', icon: Shield, view: 'audit', desc: 'Movement ledger & corrections', staffOnly: true },
    { label: 'Settings', icon: SettingsIcon, view: 'settings', desc: 'Locations, users & account', staffOnly: true },
  ];

  const filtered = items.filter((i) => !i.staffOnly || isStaff);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">More</h1>
      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => setView(item.view)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

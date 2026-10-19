import type { NavTab } from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui';
import { Package, ArrowLeftRight, Receipt, FileText, Shield, Settings as SettingsIcon, Users, ChevronRight, FileDown, TrendingUp, Image as ImageIcon, Wallet, Landmark, ReceiptText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ReceiptsScreen } from '@/screens/Receipts';
import { TransfersScreen } from '@/screens/Transfers';
import { ReportsScreen } from '@/screens/Reports';
import { AuditScreen } from '@/screens/Audit';
import { SettingsScreen } from '@/screens/Settings';
import { CustomersScreen } from '@/screens/Customers';
import { FinanceDashboard } from '@/screens/FinanceDashboard';
import { FinanceAdmin } from '@/screens/FinanceAdmin';
import { BannerScreen } from '@/screens/BannerScreen';

type MoreView = 'menu' | 'receipts' | 'transfers' | 'reports' | 'audit' | 'settings' | 'customers' | 'finance' | 'expenses' | 'reconciliation' | 'fin_settings' | 'banners';

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
  if (view === 'finance') return <FinanceDashboard onBack={() => setView('menu')} />;
  if (view === 'expenses') return <FinanceAdmin tab="expenses" onBack={() => setView('menu')} />;
  if (view === 'reconciliation') return <FinanceAdmin tab="reconciliation" onBack={() => setView('menu')} />;
  if (view === 'fin_settings') return <FinanceAdmin tab="settings" onBack={() => setView('menu')} />;
  if (view === 'banners') return <BannerScreen onBack={() => setView('menu')} />;

  const items: { label: string; icon: LucideIcon; view: MoreView; desc: string; staffOnly?: boolean }[] = [
    { label: 'Profit & Finance', icon: TrendingUp, view: 'finance', desc: 'Commission, costs & net profit', staffOnly: true },
    { label: 'Banner Inventory', icon: ImageIcon, view: 'banners', desc: 'Banner stock & distribution' },
    { label: 'Receipts', icon: Receipt, view: 'receipts', desc: 'Stock received & batch history', staffOnly: true },
    { label: 'Transfers', icon: ArrowLeftRight, view: 'transfers', desc: 'Dispatch & delivery confirmations' },
    { label: 'Customers', icon: Users, view: 'customers', desc: 'Customer records' },
    { label: 'Reports', icon: FileText, view: 'reports', desc: 'Download CSV reports', staffOnly: true },
    { label: 'Audit Trail', icon: Shield, view: 'audit', desc: 'Movement ledger & corrections', staffOnly: true },
    { label: 'Business Expenses', icon: Wallet, view: 'expenses', desc: 'Operating expense records', staffOnly: true },
    { label: 'Commission Reconciliation', icon: Landmark, view: 'reconciliation', desc: 'Match bank payments to sales', staffOnly: true },
    { label: 'Financial Settings', icon: ReceiptText, view: 'fin_settings', desc: 'Prices, commission & rates', staffOnly: true },
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
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <Icon className="h-5 w-5 text-purple-600" />
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

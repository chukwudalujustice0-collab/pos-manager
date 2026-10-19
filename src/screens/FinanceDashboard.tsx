import { useEffect, useState } from 'react';
import { Card, Button, LoadingSpinner, ErrorBanner, Select, Input } from '@/components/ui';
import { formatCurrency, formatDate, classNames } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';
import {
  loadFinanceBundle, loadFinanceSettings, computeTotals, dailyBreakdown,
  agentProfitability, periodRange, PERIOD_OPTIONS, type FinanceBundle, type PeriodKey,
} from '@/lib/finance';
import { TrendingUp, FileDown, Printer } from 'lucide-react';
import type { SaleFinance } from '@/lib/supabase';

export function FinanceDashboard({ onBack }: { onBack?: () => void }) {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'owner' || profile?.role === 'inventory_manager';
  const [bundle, setBundle] = useState<FinanceBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [view, setView] = useState<'summary' | 'transactions' | 'agents' | 'daily'>('summary');

  const load = async () => {
    try {
      setBundle(await loadFinanceBundle());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load finance data');
    }
  };

  useEffect(() => { void load(); }, []);

  if (!bundle) return error ? <div className="p-4"><ErrorBanner message={error} /></div> : <LoadingSpinner label="Loading finance data…" />;

  const [start, end] = periodRange(period, customStart, customEnd);
  const totals = computeTotals(bundle, start, end);
  const daily = dailyBreakdown(bundle, start, end);
  const agents = agentProfitability(bundle, start, end);
  const fin = bundle.finances.filter((f) => (start === '1970-01-01' ? true : f.sale_date >= start) && (!end || f.sale_date <= end));

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Serial Number', 'Sale Date', 'Agent', 'Selling Price', 'Commission', 'Commission Status', 'Delivery', 'Delivery Status', 'Other Expense', 'Net Profit'],
      ...fin.map((f) => [
        f.serial_number ?? '', f.sale_date, f.agent?.full_name ?? 'Direct',
        f.selling_price ?? '', f.commission_earned, f.commission_status,
        f.delivery_amount, f.delivery_status, f.other_expense, f.net_profit,
      ]),
      [],
      ['TOTALS', totals.terminals_sold, '', '', totals.commission_earned, totals.commission_received + ' received', totals.delivery_expenses, '', totals.other_expenses, totals.net_profit],
    ];
    downloadCSV(`finance_${period}_${Date.now()}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && <Button variant="ghost" size="sm" onClick={onBack}>←</Button>}
          <h1 className="text-xl font-bold text-slate-900">Profit & Finance</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {period === 'custom' && (
          <div className="flex gap-2">
            <Input value={customStart} onChange={setCustomStart} type="date" />
            <Input value={customEnd} onChange={setCustomEnd} type="date" />
          </div>
        )}
      </div>

      {/* Sub-views */}
      <div className="flex gap-1 text-sm">
        {(['summary', 'transactions', 'agents', 'daily'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={classNames('rounded-lg px-3 py-1.5 font-medium capitalize', view === v ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
            {v}
          </button>
        ))}
      </div>

      {view === 'summary' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Terminals Sold" value={String(totals.terminals_sold)} />
          <Metric label="Commission Earned" value={formatCurrency(totals.commission_earned)} accent />
          <Metric label="Commission Received" value={formatCurrency(totals.commission_received)} good />
          <Metric label="Commission Pending" value={formatCurrency(totals.commission_pending)} warn={totals.commission_pending > 0} />
          <Metric label="Delivery Expenses" value={formatCurrency(totals.delivery_expenses)} />
          <Metric label="Other Expenses" value={formatCurrency(totals.other_expenses)} />
          <Metric label="Gross Margin" value={formatCurrency(totals.gross_margin)} />
          <Metric label="Net Profit" value={formatCurrency(totals.net_profit)} accent={totals.net_profit >= 0} bad={totals.net_profit < 0} />
          <Metric label="Unpaid Delivery" value={formatCurrency(totals.unpaid_delivery)} warn={totals.unpaid_delivery > 0} />
          <Metric label="Operating Expenses" value={formatCurrency(totals.operating_expenses)} />
          <Metric label="Net Operating Result" value={formatCurrency(totals.net_operating_result)} accent={totals.net_operating_result >= 0} bad={totals.net_operating_result < 0} />
        </div>
      )}

      {view === 'transactions' && (
        <div className="space-y-2">
          {fin.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No transactions in this period.</Card>}
          {fin.map((f) => <TransactionRow key={f.id} f={f} />)}
        </div>
      )}

      {view === 'agents' && (
        <div className="space-y-2">
          {agents.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No agent activity in this period.</Card>}
          {agents.map((a) => (
            <Card key={a.agent_id ?? 'direct'} className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                <p className={classNames('text-sm font-bold', a.net >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatCurrency(a.net)}</p>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-slate-500 sm:grid-cols-4">
                <span>{a.terminals} sold</span>
                <span>Commission {formatCurrency(a.commission)}</span>
                <span>Delivery {formatCurrency(a.delivery)}</span>
                <span>Unpaid delivery {formatCurrency(a.unpaid_delivery)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {view === 'daily' && (
        <div className="space-y-1">
          {daily.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">Select a bounded period to see daily breakdown.</Card>}
          {daily.filter((d) => d.totals.terminals_sold > 0 || d.totals.delivery_expenses > 0).map((d) => (
            <div key={d.date} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
              <span className="text-slate-600">{formatDate(d.date)}</span>
              <span className="text-slate-400">{d.totals.terminals_sold} sold</span>
              <span className="font-medium text-slate-700">{formatCurrency(d.totals.net_profit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent, good, bad, warn }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean; warn?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={classNames(
        'mt-1 text-base font-bold',
        accent && 'text-purple-700',
        good && 'text-emerald-700',
        bad && 'text-red-600',
        warn && !bad && 'text-amber-600',
        !accent && !good && !bad && !warn && 'text-slate-800',
      )}>{value}</p>
    </Card>
  );
}

export function TransactionRow({ f }: { f: SaleFinance }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">{f.serial_number ?? '—'}</p>
          <p className="text-xs text-slate-500">{f.agent?.full_name || 'Direct sale'} · {formatDate(f.sale_date)}</p>
          {f.delivery_note && <p className="text-xs text-slate-400">Note: {f.delivery_note}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">{formatCurrency(f.net_profit)}</p>
          <p className="text-xs text-slate-400">Commission {formatCurrency(f.commission_earned)}</p>
          <p className="text-xs text-slate-400">Delivery {formatCurrency(f.delivery_amount)} · {f.delivery_status}</p>
        </div>
      </div>
    </Card>
  );
}

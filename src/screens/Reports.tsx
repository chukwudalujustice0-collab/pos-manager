import { useEffect, useState, useCallback } from 'react';
import { supabase, type Terminal, type Agent } from '@/lib/supabase';
import { LoadingSpinner, Button, EmptyState } from '@/components/ui';
import { STATUS_LABELS, formatDate } from '@/lib/utils';
import { FileText, ChevronLeft, FileDown } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';

type ReportKey =
  | 'full_register'
  | 'warehouse_stock'
  | 'agent_stock'
  | 'sold_mapped'
  | 'sold_pending'
  | 'exceptions'
  | 'transfers'
  | 'sales'
  | 'receipts'
  | 'movements';

const REPORTS: { key: ReportKey; title: string; description: string }[] = [
  { key: 'full_register', title: 'Complete Inventory Register', description: 'Every terminal with status, custodian and history' },
  { key: 'warehouse_stock', title: 'Current Warehouse Stock', description: 'All terminals available in warehouse' },
  { key: 'agent_stock', title: 'Stock Held by Agents', description: 'Terminals currently assigned to each agent' },
  { key: 'sold_mapped', title: 'Sold — Mapped to Customers', description: 'Sold terminals with full customer details' },
  { key: 'sold_pending', title: 'Sold — Awaiting Customer Details', description: 'Terminals sold with incomplete mapping' },
  { key: 'exceptions', title: 'Returned, Damaged & Missing', description: 'Exception stock requiring attention' },
  { key: 'sales', title: 'All Sales', description: 'Sales by date, agent and customer' },
  { key: 'movements', title: 'Full Movement History', description: 'Complete inventory ledger' },
];

export function ReportsScreen({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState<ReportKey | null>(null);

  const runReport = async (key: ReportKey) => {
    setBusy(key);
    try {
      if (key === 'movements') {
        const { data } = await supabase
          .from('inventory_movements')
          .select('*, terminal:terminals(serial_number), from_agent:agents!from_agent_id(full_name), to_agent:agents!to_agent_id(full_name), from_location:locations!from_location_id(name), to_location:locations!to_location_id(name)')
          .order('created_at', { ascending: false });
        const rows: (string | number | null)[][] = [
          ['Timestamp', 'Serial Number', 'Movement', 'From', 'To', 'Reference', 'Reason'],
          ...((data ?? []) as Record<string, unknown>[]).map((m) => {
            const t = m.terminal as { serial_number: string } | null;
            const fa = m.from_agent as { full_name: string } | null;
            const ta = m.to_agent as { full_name: string } | null;
            const fl = m.from_location as { name: string } | null;
            const tl = m.to_location as { name: string } | null;
            return [
              String(m.created_at), t?.serial_number ?? '', String(m.movement_type),
              fa?.full_name ?? fl?.name ?? '', ta?.full_name ?? tl?.name ?? '',
              String(m.reference ?? ''), String(m.reason ?? ''),
            ];
          }),
        ];
        downloadCSV(`movement_ledger_${Date.now()}.csv`, rows);
        return;
      }

      const { data } = await supabase
        .from('terminals')
        .select('*, agent:agents(*), location:locations(*), receipt_batch:receipt_batches(*), customer:customers(*)')
        .order('serial_number');
      const terminals = (data ?? []) as (Terminal & { customer?: { full_name: string; phone: string | null } | null })[];

      const header = ['Serial Number', 'Model', 'Status', 'Agent', 'Location', 'Date Received', 'Date Assigned', 'Date Sold', 'Customer', 'Customer Phone', 'Supplier', 'Batch'];
      const allRows: (string | number | null)[][] = [header];

      const include = (t: Terminal): boolean => {
        switch (key) {
          case 'full_register': return true;
          case 'warehouse_stock': return t.status === 'available' || t.status === 'returned';
          case 'agent_stock': return t.status === 'assigned';
          case 'sold_mapped': return t.status === 'sold' && t.mapping_status === 'mapped';
          case 'sold_pending': return t.status === 'sold' && t.mapping_status === 'pending_details';
          case 'exceptions': return t.status === 'returned' || t.status === 'damaged' || t.status === 'missing';
          default: return true;
        }
      };

      for (const t of terminals.filter(include)) {
        allRows.push([
          t.serial_number, t.model, STATUS_LABELS[t.status],
          t.agent?.full_name ?? '', t.location?.name ?? '',
          formatDate(t.date_received), formatDate(t.date_assigned), formatDate(t.date_sold),
          t.customer?.full_name ?? '', t.customer?.phone ?? '',
          t.supplier ?? '', t.receipt_batch?.batch_code ?? '',
        ]);
      }
      downloadCSV(`report_${key}_${Date.now()}.csv`, allRows);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
      </div>
      <p className="text-sm text-slate-500">Download CSV reports generated live from your database.</p>
      <div className="space-y-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{r.title}</p>
                <p className="text-xs text-slate-400">{r.description}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy === r.key} onClick={() => runReport(r.key)}>
              <FileDown className="h-4 w-4" /> {busy === r.key ? '…' : 'CSV'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

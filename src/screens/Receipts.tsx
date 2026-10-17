import { useEffect, useState, useCallback } from 'react';
import { supabase, type ReceiptBatch } from '@/lib/supabase';
import { Card, LoadingSpinner, EmptyState, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Receipt, ChevronLeft, FileDown } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';

export function ReceiptsScreen({ onBack }: { onBack: () => void }) {
  const [batches, setBatches] = useState<ReceiptBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('receipt_batches')
      .select('*, location:locations(*)')
      .order('created_at', { ascending: false });
    setBatches((data ?? []) as ReceiptBatch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Batch Code', 'Supplier', 'Delivery Ref', 'Date Received', 'Expected', 'Received', 'Location', 'Notes'],
      ...batches.map((b) => [b.batch_code, b.supplier, b.delivery_ref, formatDate(b.date_received), b.qty_expected, b.qty_received, b.location?.name ?? '', b.notes ?? '']),
    ];
    downloadCSV(`receipts_${Date.now()}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Receipts</h1>
        {batches.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto"><FileDown className="h-4 w-4" /> Export</Button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : batches.length === 0 ? (
        <EmptyState icon={<Receipt className="h-12 w-12" />} title="No receipt batches" subtitle="Import serial numbers to create your first batch." />
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <Card key={b.id} className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{b.batch_code}</p>
                  <p className="text-xs text-slate-500">{b.supplier} · {formatDate(b.date_received)}</p>
                  {b.delivery_ref && <p className="text-xs text-slate-400">Ref: {b.delivery_ref}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">{b.qty_received}</p>
                  <p className="text-xs text-slate-400">terminals</p>
                </div>
              </div>
              {b.qty_expected !== b.qty_received && (
                <p className="mt-1 text-xs text-amber-600">Expected {b.qty_expected}, received {b.qty_received} — discrepancy</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

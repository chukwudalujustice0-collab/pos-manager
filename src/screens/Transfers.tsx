import { useEffect, useState, useCallback } from 'react';
import { supabase, type Transfer } from '@/lib/supabase';
import { LoadingSpinner, EmptyState, StatusChip, Modal, Button, ErrorBanner } from '@/components/ui';
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_COLORS, formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeftRight, ChevronLeft, X, Check, FileDown } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';

export function TransfersScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Transfer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('transfers')
      .select('*, source_location:locations!source_location_id(*), dest_location:locations!dest_location_id(*), source_agent:agents!source_agent_id(*), dest_agent:agents!dest_agent_id(*)')
      .order('created_at', { ascending: false });
    if (!isStaff && profile?.agent_id) {
      q = q.or(`source_agent_id.eq.${profile.agent_id},dest_agent_id.eq.${profile.agent_id}`);
    }
    const { data } = await q;
    setTransfers((data ?? []) as Transfer[]);
    setLoading(false);
  }, [isStaff, profile?.agent_id]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Transfer Code', 'From', 'To', 'Qty', 'Received', 'Status', 'Dispatch Date', 'Waybill'],
      ...transfers.map((t) => [
        t.transfer_code,
        t.source_agent?.full_name ?? t.source_location?.name ?? 'Warehouse',
        t.dest_agent?.full_name ?? t.dest_location?.name ?? 'Warehouse',
        t.qty_total, t.qty_received, TRANSFER_STATUS_LABELS[t.status],
        formatDate(t.dispatch_date), t.waybill_ref ?? '',
      ]),
    ];
    downloadCSV(`transfers_${Date.now()}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Transfers</h1>
        {transfers.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto"><FileDown className="h-4 w-4" /> Export</Button>
        )}
      </div>

      {loading ? <LoadingSpinner /> : transfers.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="h-12 w-12" />} title="No transfers yet" subtitle="Dispatch stock to an agent from the Agents screen." />
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-purple-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{t.transfer_code}</p>
                  <p className="text-xs text-slate-500">
                    {t.source_agent?.full_name || t.source_location?.name || 'Warehouse'} → {t.dest_agent?.full_name || t.dest_location?.name || 'Warehouse'}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(t.dispatch_date)} · {t.qty_total} terminals</p>
                </div>
                <StatusChip label={TRANSFER_STATUS_LABELS[t.status]} color={TRANSFER_STATUS_COLORS[t.status]} />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <TransferDetailModal transfer={selected} onClose={() => setSelected(null)} onChanged={load} canConfirm={isStaff || selected.dest_agent_id === profile?.agent_id} />}
    </div>
  );
}

function TransferDetailModal({ transfer, onClose, onChanged, canConfirm }: { transfer: Transfer; onClose: () => void; onChanged: () => void; canConfirm: boolean }) {
  const [items, setItems] = useState<(import('@/lib/supabase').TransferItem)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('transfer_items')
      .select('*, terminal:terminals(*)')
      .eq('transfer_id', transfer.id);
    setItems((data ?? []) as import('@/lib/supabase').TransferItem[]);
    setLoading(false);
  }, [transfer.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const confirmReceipt = async (terminalId: string, accepted: boolean, disputeNote: string) => {
    setBusy(true);
    setError(null);
    const { error: uErr } = await supabase
      .from('transfer_items')
      .update({ received: accepted, disputed: !accepted, dispute_note: accepted ? null : disputeNote })
      .eq('transfer_id', transfer.id)
      .eq('terminal_id', terminalId);
    if (uErr) { setError(uErr.message); setBusy(false); return; }

    // Update terminal custodian on acceptance
    if (accepted) {
      await supabase.from('terminals').update({ status: 'assigned', agent_id: transfer.dest_agent_id, date_assigned: new Date().toISOString().slice(0, 10) }).eq('id', terminalId);
      await supabase.from('inventory_movements').insert({
        terminal_id: terminalId,
        movement_type: 'transfer_receive',
        to_agent_id: transfer.dest_agent_id,
        transfer_id: transfer.id,
        reference: transfer.transfer_code,
        reason: 'Agent confirmed receipt',
      });
    } else {
      // Disputed item returns to warehouse availability
      await supabase.from('terminals').update({ status: 'available', agent_id: null, exception_flag: true }).eq('id', terminalId);
      await supabase.from('inventory_movements').insert({
        terminal_id: terminalId,
        movement_type: 'correction',
        transfer_id: transfer.id,
        reference: transfer.transfer_code,
        reason: `Disputed on receipt: ${disputeNote}`,
      });
    }

    // Recompute transfer status
    const { data: all } = await supabase.from('transfer_items').select('received, disputed').eq('transfer_id', transfer.id);
    const rows = (all ?? []) as { received: boolean; disputed: boolean }[];
    const receivedCount = rows.filter((r) => r.received).length;
    const disputedCount = rows.filter((r) => r.disputed).length;
    let status: Transfer['status'] = 'dispatched';
    if (receivedCount === rows.length && rows.length > 0) status = 'received';
    else if (receivedCount > 0) status = 'partial';
    if (disputedCount > 0) status = 'exception';
    await supabase.from('transfers').update({ status, qty_received: receivedCount, received_date: status === 'received' ? new Date().toISOString().slice(0, 10) : null }).eq('id', transfer.id);

    setBusy(false);
    loadItems();
    onChanged();
  };

  const allItems = items.length > 0;
  const pendingItems = items.filter((i) => !i.received && !i.disputed);

  return (
    <Modal open={true} onClose={onClose} title={transfer.transfer_code} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusChip label={TRANSFER_STATUS_LABELS[transfer.status]} color={TRANSFER_STATUS_COLORS[transfer.status]} />
          <p className="text-sm text-slate-500">{transfer.qty_received} of {transfer.qty_total} received</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">From</p><p className="font-medium text-slate-700">{transfer.source_agent?.full_name || transfer.source_location?.name || 'Warehouse'}</p></div>
          <div><p className="text-xs text-slate-400">To</p><p className="font-medium text-slate-700">{transfer.dest_agent?.full_name || transfer.dest_location?.name || 'Warehouse'}</p></div>
          <div><p className="text-xs text-slate-400">Dispatched</p><p className="font-medium text-slate-700">{formatDate(transfer.dispatch_date)}</p></div>
          <div><p className="text-xs text-slate-400">Waybill</p><p className="font-medium text-slate-700">{transfer.waybill_ref || '—'}</p></div>
        </div>

        {loading ? <LoadingSpinner /> : (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Terminals ({items.length})</h3>
            <div className="space-y-1">
              {items.map((i) => {
                const t = i.terminal as unknown as { serial_number: string } | undefined;
                return (
                  <div key={i.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                    <span className="font-mono text-sm text-slate-700">{t?.serial_number ?? '—'}</span>
                    <div className="flex items-center gap-2">
                      {i.received && <StatusChip label="Received" color="bg-emerald-100 text-emerald-700 border-emerald-200" />}
                      {i.disputed && <StatusChip label="Disputed" color="bg-red-100 text-red-700 border-red-200" />}
                      {canConfirm && !i.received && !i.disputed && (
                        <div className="flex gap-1">
                          <button
                            disabled={busy}
                            onClick={() => confirmReceipt(i.terminal_id, true, '')}
                            className="rounded bg-emerald-600 p-1 text-white disabled:opacity-50"
                            title="Accept"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              const note = window.prompt('Dispute reason:');
                              if (note) confirmReceipt(i.terminal_id, false, note);
                            }}
                            className="rounded bg-red-600 p-1 text-white disabled:opacity-50"
                            title="Dispute"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canConfirm && pendingItems.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">Confirm each terminal as received or disputed. Disputed terminals return to warehouse stock.</p>
            )}
          </div>
        )}

        {error && <ErrorBanner message={error} />}
        <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
      </div>
    </Modal>
  );
}

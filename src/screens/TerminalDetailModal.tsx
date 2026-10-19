import { useEffect, useState } from 'react';
import { supabase, type Terminal, type InventoryMovement, type SaleFinance } from '@/lib/supabase';
import { Modal, StatusChip, LoadingSpinner, Button, Select, Textarea, Input, ErrorBanner } from '@/components/ui';
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatDateTime, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Package, ArrowRight, ShoppingCart, AlertTriangle, RotateCcw, Edit, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function TerminalDetailModal({ terminal, onClose, onChanged }: { terminal: Terminal; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [finance, setFinance] = useState<SaleFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMovements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('inventory_movements')
      .select('*, from_location:locations!from_location_id(*), to_location:locations!to_location_id(*), from_agent:agents!from_agent_id(*), to_agent:agents!to_agent_id(*)')
      .eq('terminal_id', terminal.id)
      .order('created_at', { ascending: true });
    setMovements((data ?? []) as InventoryMovement[]);

    // Financial record for this terminal's sale
    if (terminal.sale_id) {
      const { data: fin } = await supabase.from('sale_finances').select('*, agent:agents(*)').eq('sale_id', terminal.sale_id).maybeSingle();
      setFinance((fin as SaleFinance) ?? null);
    } else {
      setFinance(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMovements();
  }, [terminal.id]);

  const movementIcons: Record<string, LucideIcon> = {
    receipt: Package,
    dispatch: ArrowRight,
    transfer_receive: Package,
    sale: ShoppingCart,
    return: RotateCcw,
    damage: AlertTriangle,
    missing: AlertTriangle,
    correction: Edit,
    reassign: ArrowRight,
  };

  const changeStatus = async (newStatus: Terminal['status'], reason: string) => {
    setError(null);
    const { error: uErr } = await supabase.from('terminals').update({ status: newStatus, exception_flag: newStatus === 'damaged' || newStatus === 'missing' }).eq('id', terminal.id);
    if (uErr) { setError(uErr.message); return; }
    await supabase.from('inventory_movements').insert({
      terminal_id: terminal.id,
      movement_type: newStatus === 'damaged' ? 'damage' : newStatus === 'missing' ? 'missing' : newStatus === 'returned' ? 'return' : 'correction',
      performed_by: user?.id,
      reason,
    });
    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'status_change',
      entity_type: 'terminal',
      entity_id: terminal.id,
      details: { from: terminal.status, to: newStatus, reason },
    });
    onChanged();
    setEditOpen(false);
  };

  return (
    <Modal open={true} onClose={onClose} title={terminal.serial_number} size="lg">
      <div className="space-y-4">
        {/* Header info */}
        <div className="flex items-center gap-3">
          <StatusChip label={STATUS_LABELS[terminal.status]} color={STATUS_COLORS[terminal.status]} />
          {terminal.mapping_status && (
            <StatusChip label={terminal.mapping_status === 'mapped' ? 'Mapped' : 'Pending Details'} color={terminal.mapping_status === 'mapped' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'} />
          )}
          {terminal.exception_flag && <span className="text-xs text-red-600">⚠ Exception</span>}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <DetailRow label="Model" value={terminal.model || '—'} />
          <DetailRow label="Supplier" value={terminal.supplier || '—'} />
          <DetailRow label="Date Received" value={formatDate(terminal.date_received)} />
          <DetailRow label="Location" value={terminal.location?.name || '—'} />
          <DetailRow label="Agent" value={terminal.agent?.full_name || '—'} />
          <DetailRow label="Date Assigned" value={formatDate(terminal.date_assigned)} />
          <DetailRow label="Date Sold" value={formatDate(terminal.date_sold)} />
          <DetailRow label="Batch" value={terminal.receipt_batch?.batch_code || '—'} />
        </div>

        {terminal.notes && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p className="mb-1 text-xs font-semibold text-slate-400">Notes</p>
            {terminal.notes}
          </div>
        )}

        {/* Financial details */}
        {terminal.sale_id && finance && (
          <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><TrendingUp className="h-4 w-4 text-purple-600" /> Financial Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <DetailRow label="Selling Price" value={finance.selling_price != null ? `₦${Number(finance.selling_price).toLocaleString()}` : '—'} />
              <DetailRow label="Commission Earned" value={`₦${Number(finance.commission_earned).toLocaleString()}`} />
              <DetailRow label="Commission Status" value={finance.commission_status} />
              <DetailRow label="Commission Paid" value={`₦${Number(finance.commission_paid_amount).toLocaleString()}`} />
              <DetailRow label="Delivery Cost" value={`₦${Number(finance.delivery_amount).toLocaleString()}`} />
              <DetailRow label="Delivery Status" value={`${finance.delivery_status}${finance.delivery_recipient ? ` — ${finance.delivery_recipient}` : ''}`} />
              <DetailRow label="Other Expenses" value={`₦${Number(finance.other_expense).toLocaleString()}`} />
              <DetailRow label="Net Profit" value={`₦${Number(finance.net_profit).toLocaleString()}`} />
            </div>
            {finance.delivery_note && <p className="mt-2 text-xs text-slate-500">Note: {finance.delivery_note}</p>}
          </div>
        )}

        {/* Status change for staff */}
        {user && (
          <StatusChanger current={terminal.status} onChange={changeStatus} error={error} />
        )}

        {/* Lifecycle timeline */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Lifecycle History</h3>
          {loading ? (
            <LoadingSpinner />
          ) : movements.length === 0 ? (
            <p className="text-sm text-slate-400">No movements recorded</p>
          ) : (
            <div className="space-y-0">
              {movements.map((m, i) => {
                const Icon = movementIcons[m.movement_type] ?? Package;
                const isLast = i === movements.length - 1;
                return (
                  <div key={m.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={classNames('flex h-8 w-8 items-center justify-center rounded-full', isLast ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500')}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-slate-200" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-slate-800 capitalize">{m.movement_type.replace('_', ' ')}</p>
                      <p className="text-xs text-slate-500">
                        {m.from_agent?.full_name || m.from_location?.name || 'Warehouse'}
                        {' → '}
                        {m.to_agent?.full_name || m.to_location?.name || '—'}
                      </p>
                      {m.reference && <p className="text-xs text-slate-400">Ref: {m.reference}</p>}
                      {m.reason && <p className="text-xs text-slate-400">Reason: {m.reason}</p>}
                      <p className="text-xs text-slate-400">{formatDateTime(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  );
}

function StatusChanger({ current, onChange, error }: { current: Terminal['status']; onChange: (s: Terminal['status'], r: string) => void; error: string | null }) {
  const [newStatus, setNewStatus] = useState<Terminal['status']>(current);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Edit className="h-4 w-4" /> Change Status
      </Button>
    );
  }

  const statusOptions = (['available', 'assigned', 'in_transit', 'sold', 'returned', 'damaged', 'missing'] as Terminal['status'][])
    .filter((s) => s !== current)
    .map((s) => ({ value: s, label: STATUS_LABELS[s] }));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h4 className="text-sm font-semibold text-slate-700">Change Terminal Status</h4>
      <Select label="New Status" value={newStatus === current ? '' : newStatus} onChange={(v) => setNewStatus(v as Terminal['status'])} placeholder="Select new status" options={statusOptions} />
      <Textarea label="Reason (required for audit)" value={reason} onChange={setReason} rows={2} />
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={!newStatus || newStatus === current || !reason} onClick={() => onChange(newStatus, reason)}>
          Confirm Change
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase, type Terminal, type InventoryMovement, type SaleFinance, type AuditEvent, type TerminalReturn } from '@/lib/supabase';
import { Modal, StatusChip, LoadingSpinner, Button, Select, Textarea, Input, ErrorBanner, SuccessBanner } from '@/components/ui';
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatDateTime, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Package, ArrowRight, ShoppingCart, AlertTriangle, RotateCcw, Edit, TrendingUp, Trash2, Check, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function TerminalDetailModal({ terminal, onClose, onChanged }: { terminal: Terminal; onClose: () => void; onChanged: () => void }) {
  const { user, profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [finance, setFinance] = useState<SaleFinance | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [activeReturn, setActiveReturn] = useState<TerminalReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serialModal, setSerialModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);

  const loadMovements = async () => {
    setLoading(true);
    const [movRes, audRes] = await Promise.all([
      supabase
        .from('inventory_movements')
        .select('*, from_location:locations!from_location_id(*), to_location:locations!to_location_id(*), from_agent:agents!from_agent_id(*), to_agent:agents!to_agent_id(*)')
        .eq('terminal_id', terminal.id)
        .order('created_at', { ascending: true }),
      supabase.from('audit_events').select('*').eq('entity_type', 'terminal').eq('entity_id', terminal.id).order('created_at', { ascending: false }).limit(20),
    ]);
    setMovements((movRes.data ?? []) as InventoryMovement[]);
    setAudit((audRes.data ?? []) as AuditEvent[]);

    if (terminal.sale_id) {
      const { data: fin } = await supabase.from('sale_finances').select('*, agent:agents(*)').eq('sale_id', terminal.sale_id).maybeSingle();
      setFinance((fin as SaleFinance) ?? null);
    } else {
      setFinance(null);
    }
    if (terminal.return_id) {
      const { data: ret } = await supabase.from('terminal_returns').select('*').eq('id', terminal.return_id).maybeSingle();
      setActiveReturn((ret as TerminalReturn) ?? null);
    } else {
      setActiveReturn(null);
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

        {/* Staff admin actions: serial correction, safe delete, return confirmation */}
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSerialModal(true)}><Edit className="h-4 w-4" /> Correct Serial</Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteModal(true)}><Trash2 className="h-4 w-4" /> Delete Record</Button>
            {terminal.status === 'returned' && activeReturn && !activeReturn.confirmed && !activeReturn.rejected && (
              <Button size="sm" variant="secondary" onClick={() => setReturnModal(true)}><Check className="h-4 w-4" /> Confirm Return</Button>
            )}
          </div>
        )}

        {/* Active return banner */}
        {activeReturn && (
          <div className={classNames('rounded-lg border p-3 text-sm', activeReturn.confirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : activeReturn.rejected ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
            <p className="font-semibold">Return {activeReturn.confirmed ? 'confirmed' : activeReturn.rejected ? 'rejected' : 'awaiting confirmation'}</p>
            <p className="text-xs">Reason: {activeReturn.reason}</p>
            <p className="text-xs">Condition: {activeReturn.condition.replace('_', ' ')}</p>
            <p className="text-xs">Requested: {formatDateTime(activeReturn.return_date)}</p>
          </div>
        )}

        {/* Audit history */}
        {audit.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Audit History</h3>
            <div className="space-y-1">
              {audit.map((a) => (
                <div key={a.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
                  <span className="font-medium text-slate-700">{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-slate-400"> · {formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
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

      {serialModal && (
        <CorrectSerialModal terminal={terminal} onClose={() => setSerialModal(false)} onDone={() => { setSerialModal(false); onChanged(); }} />
      )}
      {deleteModal && (
        <DeleteTerminalModal terminal={terminal} onClose={() => setDeleteModal(false)} onDone={() => { setDeleteModal(false); onClose(); onChanged(); }} />
      )}
      {returnModal && activeReturn && (
        <ConfirmReturnModal ret={activeReturn} serial={terminal.serial_number} onClose={() => setReturnModal(false)} onDone={() => { setReturnModal(false); onChanged(); }} />
      )}
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

function CorrectSerialModal({ terminal, onClose, onDone }: { terminal: Terminal; onClose: () => void; onDone: () => void }) {
  const [newSerial, setNewSerial] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('correct_terminal_serial', {
      p_terminal_id: terminal.id,
      p_new_serial: newSerial.trim().toUpperCase(),
      p_reason: reason,
    });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Correction failed'); return; }
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Correct Serial Number">
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p><span className="text-slate-400">Current serial:</span> <span className="font-mono font-semibold">{terminal.serial_number}</span></p>
          <p><span className="text-slate-400">Status:</span> {STATUS_LABELS[terminal.status]}</p>
        </div>
        <Input label="New Serial Number" value={newSerial} onChange={(v) => setNewSerial(v.toUpperCase())} required placeholder="WEMA001234" />
        <Textarea label="Reason for Correction" value={reason} onChange={setReason} required rows={2} />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !newSerial.trim() || !reason.trim()} className="flex-1">{busy ? 'Saving…' : 'Correct Serial'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
        <p className="text-xs text-slate-400">The original serial, new serial, reason, and your name are recorded in the audit trail.</p>
      </div>
    </Modal>
  );
}

function DeleteTerminalModal({ terminal, onClose, onDone }: { terminal: Terminal; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = terminal.status === 'available' && !terminal.sale_id && !terminal.agent_id;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('delete_terminal_safe', {
      p_terminal_id: terminal.id,
      p_reason: reason,
    });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Deletion failed'); return; }
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title="Delete Terminal Record">
      <div className="space-y-3">
        {!eligible && (
          <ErrorBanner message="This terminal cannot be permanently deleted because it has been assigned, sold, or has transaction history. Use serial correction or a status change instead." />
        )}
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p><span className="text-slate-400">Serial:</span> <span className="font-mono font-semibold">{terminal.serial_number}</span></p>
          <p><span className="text-slate-400">Status:</span> {STATUS_LABELS[terminal.status]}</p>
        </div>
        <Textarea label="Reason for Deletion" value={reason} onChange={setReason} required rows={2} />
        <Input label='Type DELETE to confirm' value={confirmText} onChange={setConfirmText} placeholder="DELETE" required />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button variant="danger" onClick={submit} disabled={busy || !reason.trim() || confirmText !== 'DELETE' || !eligible} className="flex-1">
            {busy ? 'Deleting…' : 'Permanently Delete'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
        <p className="text-xs text-slate-400">Deletion is permanent and recorded in the audit trail. Only unused, unassigned terminals can be deleted.</p>
      </div>
    </Modal>
  );
}

function ConfirmReturnModal({ ret, serial, onClose, onDone }: { ret: TerminalReturn; serial: string; onClose: () => void; onDone: () => void }) {
  const [finalCondition, setFinalCondition] = useState<'working' | 'damaged' | 'awaiting_inspection'>(ret.condition);
  const [reject, setReject] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('confirm_return_receipt', {
      p_return_id: ret.id,
      p_final_condition: finalCondition,
      p_reject: reject,
      p_rejection_note: rejectionNote || null,
    });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Confirmation failed'); return; }
    onDone();
  };

  return (
    <Modal open={true} onClose={onClose} title={`Confirm Return — ${serial}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p><span className="text-slate-400">Reason:</span> {ret.reason}</p>
          <p><span className="text-slate-400">Reported condition:</span> {ret.condition.replace('_', ' ')}</p>
          <p><span className="text-slate-400">Requested:</span> {formatDateTime(ret.return_date)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReject(false)} className={classNames('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium', !reject ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-600')}>Confirm Return</button>
          <button onClick={() => setReject(true)} className={classNames('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium', reject ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600')}>Reject Return</button>
        </div>
        {!reject && (
          <Select label="Final Condition" value={finalCondition} onChange={(v) => setFinalCondition(v as typeof finalCondition)} options={[
            { value: 'working', label: 'Working — restore to stock' },
            { value: 'damaged', label: 'Damaged — quarantine' },
            { value: 'awaiting_inspection', label: 'Still awaiting inspection' },
          ]} />
        )}
        {reject && <Textarea label="Rejection Note" value={rejectionNote} onChange={setRejectionNote} rows={2} />}
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Processing…' : reject ? 'Reject Return' : 'Confirm Return'}</Button>
        <p className="text-xs text-slate-400">Stock is restored only when a working terminal is confirmed. Damaged terminals are quarantined.</p>
      </div>
    </Modal>
  );
}

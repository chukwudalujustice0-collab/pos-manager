import { useEffect, useState, useCallback } from 'react';
import { supabase, type BannerReceipt, type BannerTransfer, type BannerMovement, type BannerType, type BannerBalance, type Agent, type Location, type BannerIssueLog } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, ErrorBanner, Modal, Input, Select, Textarea, StatusChip, EmptyState } from '@/components/ui';
import { formatDate, generateCode, classNames } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';
import { Plus, FileDown, PackageCheck, ArrowRightLeft, ClipboardCheck } from 'lucide-react';

export type BannerView = 'dashboard' | 'receive' | 'transfers' | 'report';

export function BannerScreen({ onBack }: { onBack?: () => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [view, setView] = useState<BannerView>('dashboard');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {onBack && <Button variant="ghost" size="sm" onClick={onBack}>←</Button>}
        <h1 className="text-xl font-bold text-slate-900">Banner Inventory</h1>
      </div>
      <div className="flex gap-1 text-sm">
        {([['dashboard', 'Stock'], ['receive', 'Receive'], ['transfers', 'Transfers'], ['report', 'Issued']] as [BannerView, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className={classNames('rounded-lg px-3 py-1.5 font-medium', view === v ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
            {label}
          </button>
        ))}
      </div>
      {view === 'dashboard' && <BannerStockDashboard isStaff={isStaff} />}
      {view === 'receive' && isStaff && <BannerReceiveView onDone={loadAnything} />}
      {view === 'transfers' && <BannerTransfersView isStaff={isStaff} />}
      {view === 'report' && <BannerIssuedReport />}
    </div>
  );
}

// Force a refresh across child views after writes
function loadAnything() { window.dispatchEvent(new Event('banner-refresh')); }

// ============================================================
// Stock dashboard + reconciliation
// ============================================================
function BannerStockDashboard({ isStaff }: { isStaff: boolean }) {
  const [balances, setBalances] = useState<BannerBalance[]>([]);
  const [transfers, setTransfers] = useState<BannerTransfer[]>([]);
  const [issueLog, setIssueLog] = useState<BannerIssueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, t, i] = await Promise.all([
      supabase.from('banner_balances').select('*, banner_type:banner_types(*), agent:agents(*), location:locations(*)'),
      supabase.from('banner_transfers').select('*, banner_type:banner_types(*), dest_agent:agents(*)').eq('status', 'in_transit'),
      supabase.from('banner_issue_log').select('*, banner_type:banner_types(*)'),
    ]);
    setBalances((b.data ?? []) as BannerBalance[]);
    setTransfers((t.data ?? []) as BannerTransfer[]);
    setIssueLog((i.data ?? []) as BannerIssueLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener('banner-refresh', handler);
    return () => window.removeEventListener('banner-refresh', handler);
  }, [load]);

  if (loading) return <LoadingSpinner />;

  const inTransit = transfers.reduce((s, t) => s + t.qty_dispatched, 0);
  const issued = issueLog.reduce((s, i) => s + i.quantity, 0);
  const warehouse = balances.filter((b) => !b.agent_id).reduce((s, b) => s + b.quantity, 0);
  const withAgents = balances.filter((b) => b.agent_id).reduce((s, b) => s + b.quantity, 0);
  const accounted = warehouse + withAgents + inTransit + issued;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="In Warehouse" value={warehouse} />
        <Metric label="With Agents" value={withAgents} />
        <Metric label="In Transit" value={inTransit} />
        <Metric label="Issued with Sales" value={issued} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Total Accounted For" value={accounted} accent />
        <Metric label="Stock Rows" value={balances.length} />
      </div>

      {isStaff && (
        <Button variant="outline" onClick={() => setAdjustOpen(true)}><ClipboardCheck className="h-4 w-4" /> Reconcile Physical Count</Button>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">Balances by holder</p>
        {balances.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No banner stock yet. Receive banners first.</Card>}
        {balances.map((b) => (
          <Card key={b.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{b.banner_type?.name ?? 'Banner'}</p>
              <p className="text-xs text-slate-400">{b.agent?.full_name ?? b.location?.name ?? 'Unassigned'}</p>
            </div>
            <span className="text-lg font-bold text-slate-800">{b.quantity}</span>
          </Card>
        ))}
      </div>

      {adjustOpen && <AdjustModal balances={balances} onClose={() => setAdjustOpen(false)} onDone={load} />}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={classNames('mt-1 text-lg font-bold', accent ? 'text-purple-700' : 'text-slate-800')}>{value}</p>
    </Card>
  );
}

function AdjustModal({ balances, onClose, onDone }: { balances: BannerBalance[]; onClose: () => void; onDone: () => void }) {
  const [balanceId, setBalanceId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = balances.find((b) => b.id === balanceId);

  const submit = async () => {
    setBusy(true); setError(null);
    if (!selected) { setError('Select a stock row.'); setBusy(false); return; }
    if (!reason.trim()) { setError('A reason is required for the audit trail.'); setBusy(false); return; }
    const { error } = await supabase.rpc('adjust_banner_stock', {
      p_banner_type_id: selected.banner_type_id,
      p_agent_id: selected.agent_id,
      p_location_id: selected.location_id,
      p_new_quantity: parseInt(newQty) || 0,
      p_reason: reason.trim(),
    });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone(); onClose(); loadAnything(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Reconcile Banner Stock">
      <div className="space-y-3">
        <Select
          label="Stock row"
          value={balanceId}
          onChange={setBalanceId}
          options={[
            { value: '', label: 'Select…' },
            ...balances.map((b) => ({ value: b.id, label: `${b.banner_type?.name ?? 'Banner'} — ${b.agent?.full_name ?? b.location?.name ?? '?'} (current: ${b.quantity})` })),
          ]}
        />
        <Input label="Counted Quantity" value={newQty} onChange={setNewQty} type="number" />
        <Textarea label="Reason (required)" value={reason} onChange={setReason} rows={2} placeholder="e.g. damaged in transit, physical count correction" />
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Apply Adjustment'}</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// Receive banners
// ============================================================
function BannerReceiveView({ onDone }: { onDone: () => void }) {
  const [receipts, setReceipts] = useState<BannerReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('banner_receipts').select('*, location:locations(*)').order('created_at', { ascending: false });
    setReceipts((data ?? []) as BannerReceipt[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Banner Receipts</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Receive Banners</Button>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingSpinner /> : receipts.length === 0 ? (
        <EmptyState icon={<PackageCheck className="h-10 w-10" />} title="No receipts yet" subtitle="Record your first banner delivery." />
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.receipt_code}</p>
                  <p className="text-xs text-slate-400">{r.supplier} · {formatDate(r.date_received)} · {r.location?.name ?? '—'}</p>
                </div>
                <span className="text-xs text-slate-400">{r.delivery_ref ?? ''}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {addOpen && <ReceiveModal onClose={() => setAddOpen(false)} onDone={() => { load(); onDone(); }} />}
    </div>
  );
}

function ReceiveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [bannerTypeName, setBannerTypeName] = useState('');
  const [sku, setSku] = useState('');
  const [supplier, setSupplier] = useState('Wema Bank');
  const [deliveryRef, setDeliveryRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState('');
  const [qtyExpected, setQtyExpected] = useState('');
  const [qtyReceived, setQtyReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('locations').select('*').eq('is_active', true).then(({ data }) => {
      const locs = (data ?? []) as Location[];
      setLocations(locs);
      if (locs.length > 0) setLocationId(locs[0].id);
    });
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    if (!bannerTypeName.trim()) { setError('Banner type is required.'); setBusy(false); return; }
    if (qtyReceived === '' || qtyExpected === '') { setError('Enter expected and received quantities.'); setBusy(false); return; }
    const { data: rpcData, error } = await supabase.rpc('receive_banners', {
      p_receipt_code: generateCode('BRC'),
      p_supplier: supplier.trim() || 'Unknown',
      p_date_received: date,
      p_location_id: locationId || null,
      p_banner_type_name: bannerTypeName.trim(),
      p_banner_sku: sku.trim() || null,
      p_qty_expected: parseInt(qtyExpected) || 0,
      p_qty_received: parseInt(qtyReceived) || 0,
      p_delivery_ref: deliveryRef || null,
      p_notes: notes || null,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    if (!rpcData) { setError('Receipt failed.'); setBusy(false); return; }
    onDone(); onClose(); loadAnything(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Receive Banners">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Banner Type / Description" value={bannerTypeName} onChange={setBannerTypeName} placeholder="e.g. WemaPOS Standee" />
          <Input label="SKU / Reference (optional)" value={sku} onChange={setSku} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Supplier" value={supplier} onChange={setSupplier} />
          <Input label="Delivery Reference" value={deliveryRef} onChange={setDeliveryRef} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date Received" value={date} onChange={setDate} type="date" />
          <Select label="Receiving Location" value={locationId} onChange={setLocationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity Expected" value={qtyExpected} onChange={setQtyExpected} type="number" />
          <Input label="Quantity Actually Received" value={qtyReceived} onChange={setQtyReceived} type="number" />
        </div>
        {qtyExpected && qtyReceived && qtyExpected !== qtyReceived && (
          <p className="text-xs text-amber-600">Discrepancy: expected {qtyExpected}, received {qtyReceived}. The accepted quantity ({qtyReceived}) will be recorded.</p>
        )}
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Confirm Receipt'}</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// Transfers
// ============================================================
function BannerTransfersView({ isStaff }: { isStaff: boolean }) {
  const [transfers, setTransfers] = useState<BannerTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [confirming, setConfirming] = useState<BannerTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('banner_transfers').select('*, banner_type:banner_types(*), dest_agent:agents(*), source_location:locations(*)').order('created_at', { ascending: false });
    setTransfers((data ?? []) as BannerTransfer[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exportCSV = () => {
    downloadCSV(`banner_transfers_${Date.now()}.csv`, [
      ['Code', 'Banner Type', 'Destination', 'Dispatched', 'Accepted', 'Disputed', 'Status', 'Date', 'Waybill'],
      ...transfers.map((t) => [t.transfer_code, t.banner_type?.name ?? '', t.dest_agent?.full_name ?? '', t.qty_dispatched, t.qty_accepted, t.qty_disputed, t.status, t.dispatch_date ?? '', t.waybill_ref ?? '']),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Banner Transfers</h2>
        <div className="flex gap-2">
          {isStaff && <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>}
          {isStaff && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Dispatch</Button>}
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingSpinner /> : transfers.length === 0 ? (
        <EmptyState icon={<ArrowRightLeft className="h-10 w-10" />} title="No transfers yet" subtitle="Dispatch banners to agents." />
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <Card key={t.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t.banner_type?.name} × {t.qty_dispatched} → {t.dest_agent?.full_name}</p>
                  <p className="text-xs text-slate-400">{t.transfer_code} · {formatDate(t.dispatch_date)}{t.waybill_ref ? ` · ${t.waybill_ref}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip label={t.status.replace('_', ' ')} color={t.status === 'received' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : t.status === 'exception' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-purple-100 text-purple-700 border-purple-200'} />
                  {isStaff && t.status === 'in_transit' && (
                    <Button size="sm" variant="outline" onClick={() => setConfirming(t)}>Confirm</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {addOpen && <DispatchModal onClose={() => setAddOpen(false)} onDone={load} />}
      {confirming && <ConfirmModal transfer={confirming} onClose={() => setConfirming(null)} onDone={load} />}
    </div>
  );
}

function DispatchModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [types, setTypes] = useState<BannerType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [qty, setQty] = useState('');
  const [waybill, setWaybill] = useState('');
  const [notes, setNotes] = useState('');
  const [available, setAvailable] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('banner_types').select('*').eq('is_active', true),
      supabase.from('agents').select('*').eq('is_active', true),
      supabase.from('locations').select('*').eq('is_active', true),
    ]).then(([t, a, l]) => {
      setTypes((t.data ?? []) as BannerType[]);
      setAgents((a.data ?? []) as Agent[]);
      const locs = (l.data ?? []) as Location[];
      setLocations(locs);
      if (locs.length > 0) setSourceLocationId(locs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!typeId) { setAvailable(null); return; }
    supabase.from('banner_balances').select('quantity').eq('banner_type_id', typeId).eq('location_id', sourceLocationId).is('agent_id', null)
      .maybeSingle().then(({ data }) => setAvailable(data ? (data as { quantity: number }).quantity : 0));
  }, [typeId, sourceLocationId]);

  const submit = async () => {
    setBusy(true); setError(null);
    if (!typeId || !agentId || !qty) { setError('Banner type, destination agent, and quantity are required.'); setBusy(false); return; }
    const { error } = await supabase.rpc('dispatch_banner_transfer', {
      p_transfer_code: generateCode('BTR'),
      p_banner_type_id: typeId,
      p_source_location_id: sourceLocationId || null,
      p_dest_agent_id: agentId,
      p_qty: parseInt(qty) || 0,
      p_waybill_ref: waybill || null,
      p_notes: notes || null,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone(); onClose(); loadAnything(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Dispatch Banners to Agent">
      <div className="space-y-3">
        <Select label="Banner Type" value={typeId} onChange={setTypeId} options={[{ value: '', label: 'Select…' }, ...types.map((t) => ({ value: t.id, label: t.name }))]} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Source Location" value={sourceLocationId} onChange={setSourceLocationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          <Select label="Destination Agent" value={agentId} onChange={setAgentId} options={[{ value: '', label: 'Select…' }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity Dispatched" value={qty} onChange={setQty} type="number" />
          <Input label="Waybill / Delivery Ref" value={waybill} onChange={setWaybill} />
        </div>
        {available !== null && typeId && (
          <p className={classNames('text-xs', (parseInt(qty) || 0) <= available ? 'text-slate-500' : 'text-red-600 font-medium')}>
            Warehouse available: {available}
            {(parseInt(qty) || 0) > available && ' — not enough stock.'}
          </p>
        )}
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Dispatch'}</Button>
      </div>
    </Modal>
  );
}

function ConfirmModal({ transfer, onClose, onDone }: { transfer: BannerTransfer; onClose: () => void; onDone: () => void }) {
  const [accepted, setAccepted] = useState(String(transfer.qty_dispatched));
  const [disputed, setDisputed] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('confirm_banner_transfer', {
      p_transfer_id: transfer.id,
      p_qty_accepted: parseInt(accepted) || 0,
      p_qty_disputed: parseInt(disputed) || 0,
      p_note: note || null,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone(); onClose(); loadAnything(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Confirm Banner Receipt">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{transfer.banner_type?.name} × {transfer.qty_dispatched} to {transfer.dest_agent?.full_name}</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity Accepted" value={accepted} onChange={(v) => { setAccepted(v); setDisputed(String(Math.max(0, transfer.qty_dispatched - (parseInt(v) || 0)))); }} type="number" />
          <Input label="Quantity Disputed" value={disputed} onChange={setDisputed} type="number" />
        </div>
        <Textarea label="Note" value={note} onChange={setNote} rows={2} />
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Confirming…' : 'Confirm Receipt'}</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// Issued-with-sale report + combined POS/banner report
// ============================================================
function BannerIssuedReport() {
  const [issues, setIssues] = useState<BannerIssueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    supabase.from('agents').select('*').eq('is_active', true).then(({ data }) => setAgents((data ?? []) as Agent[]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('banner_issue_log').select('*, banner_type:banner_types(*), agent:agents(*), terminal:terminals(serial_number)')
      .order('issued_at', { ascending: false });
    if (agentFilter) q = q.eq('agent_id', agentFilter);
    const { data } = await q;
    setIssues((data ?? []) as BannerIssueLog[]);
    setLoading(false);
  }, [agentFilter]);

  useEffect(() => { void load(); }, [load]);

  const exportCSV = () => {
    downloadCSV(`banner_issued_${Date.now()}.csv`, [
      ['Issued At', 'Terminal Serial', 'Banner Type', 'Quantity', 'Agent'],
      ...issues.map((i) => [formatDate(i.issued_at), i.terminal?.serial_number ?? '', i.banner_type?.name ?? '', i.quantity, i.agent?.full_name ?? 'Direct']),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Banners Issued with POS Sales</h2>
        <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>
      </div>
      <Select
        label="Filter by agent"
        value={agentFilter}
        onChange={setAgentFilter}
        options={[{ value: '', label: 'All agents' }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))]}
      />
      {loading ? <LoadingSpinner /> : issues.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">No banners issued yet. Enable "Banner issued with this sale" when recording a sale.</Card>
      ) : (
        <div className="space-y-2">
          {issues.map((i) => (
            <Card key={i.id} className="flex items-center justify-between p-3">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-900">{i.terminal?.serial_number ?? '—'}</p>
                <p className="text-xs text-slate-400">{i.banner_type?.name} · ×{i.quantity} · {i.agent?.full_name || 'Direct'} · {formatDate(i.issued_at)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

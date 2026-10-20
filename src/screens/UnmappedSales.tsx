import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Sale, type Agent, type ApprovalStatus } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, EmptyState, StatusChip, ErrorBanner, Modal, Input, Textarea, Select } from '@/components/ui';
import { MAPPING_LABELS, MAPPING_COLORS, formatDate, formatDateTime, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ClipboardList, Search, X, UserPlus, ChevronLeft, ChevronRight, RotateCcw, Check } from 'lucide-react';

type FilterKey = 'unmapped' | 'mapped' | 'returned' | 'pending_approval' | 'all';

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  confirmed: 'Confirmed',
  pending_approval: 'Pending Approval',
  rejected: 'Rejected',
};
const APPROVAL_COLORS: Record<ApprovalStatus, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending_approval: 'bg-amber-100 text-amber-700 border-amber-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const PAGE_SIZE = 15;

export function UnmappedSalesScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [sales, setSales] = useState<Sale[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('unmapped');
  const [agentFilter, setAgentFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest' | 'longest_waiting'>('recent');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('sales')
      .select('*, terminal:terminals(*), customer:customers(*), agent:agents(*)')
      .order('created_at', { ascending: false });
    if (!isStaff && profile?.agent_id) {
      q = q.eq('agent_id', profile.agent_id);
    }
    const { data, error: qErr } = await q;
    if (qErr) setError(qErr.message);
    setSales((data ?? []) as Sale[]);
    setLoading(false);
  }, [isStaff, profile?.agent_id]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (isStaff) {
      supabase.from('agents').select('*').order('full_name').then(({ data }) => setAgents((data ?? []) as Agent[]));
    }
  }, [isStaff]);

  const filtered = useMemo(() => {
    let rows = sales.slice();
    if (filter === 'unmapped') rows = rows.filter((s) => s.mapping_status === 'pending_details' && s.approval_status === 'confirmed');
    else if (filter === 'mapped') rows = rows.filter((s) => s.mapping_status === 'mapped');
    else if (filter === 'returned') rows = rows.filter((s) => s.terminal?.status === 'returned');
    else if (filter === 'pending_approval') rows = rows.filter((s) => s.approval_status === 'pending_approval');

    if (agentFilter !== 'all') rows = rows.filter((s) => s.agent_id === agentFilter);
    if (fromDate) rows = rows.filter((s) => s.sale_date >= fromDate);
    if (toDate) rows = rows.filter((s) => s.sale_date <= toDate);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((s) =>
        s.sale_code.toLowerCase().includes(q) ||
        (s.terminal?.serial_number.toLowerCase().includes(q) ?? false) ||
        (s.customer?.full_name.toLowerCase().includes(q) ?? false) ||
        (s.customer?.phone?.includes(q) ?? false)
      );
    }
    if (sort === 'recent') rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (sort === 'oldest') rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (sort === 'longest_waiting') {
      rows.sort((a, b) => {
        if (a.mapping_status === 'mapped' && b.mapping_status !== 'mapped') return 1;
        if (b.mapping_status === 'mapped' && a.mapping_status !== 'mapped') return -1;
        return a.created_at.localeCompare(b.created_at);
      });
    }
    return rows;
  }, [sales, filter, agentFilter, fromDate, toDate, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const daysAwaiting = (s: Sale): number => {
    if (s.mapping_status === 'mapped' && s.mapped_at) {
      return Math.max(0, Math.floor((new Date(s.mapped_at).getTime() - new Date(s.created_at).getTime()) / 86400000));
    }
    return Math.max(0, Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</Button>
        <h1 className="text-xl font-bold text-slate-900">Unmapped Sales</h1>
      </div>
      <p className="text-sm text-slate-500">Sold terminals awaiting customer mapping, plus completed and returned sales.</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search serial, sale code, customer, phone…" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-1 text-slate-400"><X className="h-4 w-4" /></button>}
        </div>
        <select value={filter} onChange={(e) => { setFilter(e.target.value as FilterKey); setPage(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="unmapped">Unmapped</option>
          <option value="mapped">Fully Mapped</option>
          <option value="returned">Returned</option>
          <option value="pending_approval">Awaiting Approval</option>
          <option value="all">All Sales</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isStaff && (
          <select value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="all">All Agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        )}
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" title="From date" />
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" title="To date" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="recent">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="longest_waiting">Longest Waiting</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      <p className="text-sm text-slate-500">{filtered.length} records</p>

      {loading ? (
        <LoadingSpinner label="Loading sales…" />
      ) : pageRows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="No records found" subtitle="Adjust filters or record a new sale." />
      ) : (
        <div className="space-y-2">
          {pageRows.map((s) => {
            const isReturned = s.terminal?.status === 'returned';
            const canMap = s.mapping_status === 'pending_details' && s.approval_status === 'confirmed' && !isReturned;
            const canReturn = (s.terminal?.status === 'sold' || s.terminal?.status === 'assigned') && s.approval_status === 'confirmed';
            return (
              <Card key={s.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-slate-900">{s.terminal?.serial_number ?? '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{s.sale_code} · {formatDate(s.sale_date)} · {s.agent?.full_name || 'Direct sale'}</p>
                    <p className="text-xs text-slate-500">
                      {s.customer?.full_name ? s.customer.full_name : 'No customer mapped'}
                      {s.customer?.phone ? ` · ${s.customer.phone}` : ''}
                    </p>
                    {s.mapping_status === 'pending_details' && (
                      <p className="text-xs text-amber-600">Awaiting mapping: {daysAwaiting(s)} day(s)</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusChip label={MAPPING_LABELS[s.mapping_status]} color={MAPPING_COLORS[s.mapping_status]} />
                    <StatusChip label={APPROVAL_LABELS[s.approval_status]} color={APPROVAL_COLORS[s.approval_status]} />
                    {isReturned && <StatusChip label="Returned" color="bg-slate-100 text-slate-700 border-slate-200" />}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelected(s)}>View Details</Button>
                  {canMap && <Button size="sm" onClick={() => setSelected(s)}><UserPlus className="h-3.5 w-3.5" /> Complete Mapping</Button>}
                  {canReturn && <Button size="sm" variant="secondary" onClick={() => setSelected(s)}><RotateCcw className="h-3.5 w-3.5" /> Return Terminal</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Button>
          <span className="text-xs text-slate-500">Page {safePage + 1} of {pageCount}</span>
          <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {selected && (
        <SaleDetailDrawer
          sale={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

export function SaleDetailDrawer({ sale, onClose, onChanged }: { sale: Sale; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [tab, setTab] = useState<'details' | 'map' | 'return' | 'approve'>('details');
  const isReturned = sale.terminal?.status === 'returned';
  const canMap = sale.mapping_status === 'pending_details' && sale.approval_status === 'confirmed' && !isReturned;
  const canReturn = (sale.terminal?.status === 'sold' || sale.terminal?.status === 'assigned') && sale.approval_status === 'confirmed';
  const canApprove = sale.approval_status === 'pending_approval' && isStaff;

  return (
    <Modal open={true} onClose={onClose} title={`Sale ${sale.sale_code}`} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab('details')} className={classNames('rounded-lg px-3 py-1.5 text-sm font-medium', tab === 'details' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-600')}>Details</button>
          {canMap && <button onClick={() => setTab('map')} className={classNames('rounded-lg px-3 py-1.5 text-sm font-medium', tab === 'map' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-600')}>Complete Mapping</button>}
          {canReturn && <button onClick={() => setTab('return')} className={classNames('rounded-lg px-3 py-1.5 text-sm font-medium', tab === 'return' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-600')}>Return Terminal</button>}
          {canApprove && <button onClick={() => setTab('approve')} className={classNames('rounded-lg px-3 py-1.5 text-sm font-medium', tab === 'approve' ? 'bg-purple-800 text-white' : 'bg-slate-100 text-slate-600')}>Approve Sale</button>}
        </div>

        {tab === 'details' && <SaleDetailsTab sale={sale} />}
        {tab === 'map' && <MapCustomerTab sale={sale} onDone={onChanged} />}
        {tab === 'return' && <ReturnTerminalTab sale={sale} onDone={onChanged} />}
        {tab === 'approve' && <ApproveSaleTab sale={sale} onDone={onChanged} />}
      </div>
    </Modal>
  );
}

function SaleDetailsTab({ sale }: { sale: Sale }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-slate-400">Serial Number</p><p className="font-mono font-semibold text-slate-800">{sale.terminal?.serial_number ?? '—'}</p></div>
        <div><p className="text-xs text-slate-400">Model</p><p className="text-slate-700">{sale.terminal?.model || '—'}</p></div>
        <div><p className="text-xs text-slate-400">Sale Date</p><p className="text-slate-700">{formatDate(sale.sale_date)}</p></div>
        <div><p className="text-xs text-slate-400">Agent</p><p className="text-slate-700">{sale.agent?.full_name || 'Direct sale'}</p></div>
        <div><p className="text-xs text-slate-400">Channel</p><p className="text-slate-700 capitalize">{sale.channel || '—'}</p></div>
        <div><p className="text-xs text-slate-400">Sale Price</p><p className="text-slate-700">{sale.sale_price != null ? `₦${Number(sale.sale_price).toLocaleString()}` : '—'}</p></div>
      </div>
      {sale.customer && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">Customer</p>
          <p className="font-medium text-slate-800">{sale.customer.full_name}</p>
          <p className="text-xs text-slate-600">{sale.customer.phone || ''}</p>
          {sale.customer.address && <p className="text-xs text-slate-500">{sale.customer.address}</p>}
          {sale.mapped_at && <p className="mt-1 text-xs text-slate-400">Mapped: {formatDateTime(sale.mapped_at)}</p>}
        </div>
      )}
      {sale.notes && <div className="rounded-lg bg-slate-50 p-3 text-slate-600">{sale.notes}</div>}
    </div>
  );
}

function MapCustomerTab({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const [name, setName] = useState(sale.customer?.full_name ?? '');
  const [phone, setPhone] = useState(sale.customer?.phone ?? '');
  const [email, setEmail] = useState(sale.customer?.email ?? '');
  const [state, setState] = useState(sale.customer?.state ?? '');
  const [city, setCity] = useState(sale.customer?.city ?? '');
  const [address, setAddress] = useState(sale.customer?.address ?? '');
  const [businessName, setBusinessName] = useState(sale.customer?.business_name ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('complete_sale_mapping', {
      p_sale_id: sale.id,
      p_customer_name: name,
      p_customer_phone: phone,
      p_customer_email: email || null,
      p_customer_state: state || null,
      p_customer_city: city || null,
      p_customer_address: address || null,
      p_business_name: businessName || null,
      p_notes: notes || null,
    });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Mapping failed'); return; }
    onDone();
  };

  if (review) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Review before saving</p>
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p><span className="text-slate-400">Name:</span> {name}</p>
          <p><span className="text-slate-400">Phone:</span> {phone}</p>
          {email && <p><span className="text-slate-400">Email:</span> {email}</p>}
          {state && <p><span className="text-slate-400">State:</span> {state}</p>}
          {city && <p><span className="text-slate-400">City:</span> {city}</p>}
          {address && <p><span className="text-slate-400">Address:</span> {address}</p>}
          {businessName && <p><span className="text-slate-400">Business:</span> {businessName}</p>}
          <p className="mt-1 text-xs text-slate-400">Terminal: {sale.terminal?.serial_number} · Sale: {sale.sale_code}</p>
        </div>
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? 'Saving…' : 'Confirm & Save Mapping'}</Button>
          <Button variant="outline" onClick={() => setReview(false)}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Serial: <span className="font-mono font-semibold text-slate-700">{sale.terminal?.serial_number}</span> · Sale: {sale.sale_code}</p>
      <Input label="Customer Full Name" value={name} onChange={setName} required placeholder="Customer name" />
      <Input label="Phone Number" value={phone} onChange={(v) => setPhone(v.replace(/[^\d+]/g, ''))} required placeholder="0800..." />
      <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="Optional" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="State" value={state} onChange={setState} />
        <Input label="City" value={city} onChange={setCity} />
      </div>
      <Input label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Optional" />
      <Textarea label="Address" value={address} onChange={setAddress} rows={2} />
      <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} placeholder="Optional" />
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2">
        <Button onClick={() => setReview(true)} disabled={!name.trim() || !phone.trim()} className="flex-1">Review</Button>
      </div>
    </div>
  );
}

function ReturnTerminalTab({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const terminal = sale.terminal;
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState<'working' | 'damaged' | 'awaiting_inspection'>('awaiting_inspection');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    if (!terminal) return;
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('process_terminal_return', {
      p_terminal_id: terminal.id,
      p_reason: reason,
      p_condition: condition,
      p_notes: notes || null,
    });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Return failed'); return; }
    setSuccess(r.message);
    setTimeout(onDone, 1200);
  };

  if (success) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> {success}</p>
          <p className="mt-1 text-xs">A staff member must confirm the physical receipt before stock is restored.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p><span className="text-slate-400">Serial:</span> <span className="font-mono font-semibold">{terminal?.serial_number}</span></p>
        <p><span className="text-slate-400">Sale:</span> {sale.sale_code} · <span className="text-slate-400">Date:</span> {formatDate(sale.sale_date)}</p>
        <p><span className="text-slate-400">Customer mapped:</span> {sale.mapping_status === 'mapped' ? 'Yes' : 'No'}</p>
      </div>
      <Textarea label="Reason for Return" value={reason} onChange={setReason} required rows={2} />
      <Select label="Terminal Condition" value={condition} onChange={(v) => setCondition(v as typeof condition)} options={[
        { value: 'awaiting_inspection', label: 'Awaiting Inspection' },
        { value: 'working', label: 'Working' },
        { value: 'damaged', label: 'Damaged' },
      ]} />
      <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} placeholder="Optional" />
      {error && <ErrorBanner message={error} />}
      <Button onClick={submit} disabled={busy || !reason.trim()} className="w-full">{busy ? 'Processing…' : 'Submit Return Request'}</Button>
      <p className="text-xs text-slate-400">Submitting a return does not restore stock. A staff member must confirm the physical return first.</p>
    </div>
  );
}

function ApproveSaleTab({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approve = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error: rErr } = await supabase.rpc('approve_sale', { p_sale_id: sale.id, p_approve: approve });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    const r = (data as { ok: boolean; message: string }[] | null)?.[0];
    if (!r?.ok) { setError(r?.message ?? 'Approval failed'); return; }
    onDone();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">This sale is pending approval. Approve to confirm it, or reject to void it.</p>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2">
        <Button onClick={() => approve(true)} disabled={busy} className="flex-1">Approve</Button>
        <Button variant="danger" onClick={() => approve(false)} disabled={busy}>Reject</Button>
      </div>
    </div>
  );
}

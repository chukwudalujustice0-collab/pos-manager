import { useEffect, useState, useCallback } from 'react';
import { supabase, type Sale, type Terminal, type Agent, type Customer } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, EmptyState, Modal, Input, Select, Textarea, ErrorBanner, StatusChip } from '@/components/ui';
import { MAPPING_LABELS, MAPPING_COLORS, formatDate, formatCurrency, generateCode, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ShoppingCart, Plus, FileDown, Search, X, User } from 'lucide-react';
import { ScanButton } from '@/components/ScanButton';
import { recordSaleFinanceSafe, type FinancePrefs } from '@/lib/finance';
import { loadBannerTypesForIssue, BannerIssueSection } from '@/screens/BannerShared';

export function SalesScreen() {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'mapped' | 'pending_details'>('all');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('sales')
      .select('*, terminal:terminals(*), customer:customers(*), agent:agents(*)')
      .order('created_at', { ascending: false });
    if (!isStaff && profile?.agent_id) {
      q = q.eq('agent_id', profile.agent_id);
    }
    const { data } = await q;
    setSales((data ?? []) as Sale[]);
    setLoading(false);
  }, [isStaff, profile?.agent_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = sales.filter((s) => {
    if (filter !== 'all' && s.mapping_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.sale_code.toLowerCase().includes(q) ||
        s.terminal?.serial_number.toLowerCase().includes(q) ||
        s.customer?.full_name.toLowerCase().includes(q) ||
        (s.customer?.phone?.includes(q) ?? false);
    }
    return true;
  });

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Sale Code', 'Serial Number', 'Customer', 'Phone', 'Agent', 'Sale Date', 'Price', 'Mapping Status', 'Channel'],
      ...filtered.map((s) => [
        s.sale_code, s.terminal?.serial_number ?? '', s.customer?.full_name ?? '', s.customer?.phone ?? '',
        s.agent?.full_name ?? '', formatDate(s.sale_date), s.sale_price ?? '', MAPPING_LABELS[s.mapping_status], s.channel ?? '',
      ]),
    ];
    import('@/lib/csv').then(({ downloadCSV }) => downloadCSV(`sales_${Date.now()}.csv`, rows));
  };

  if (loading) return <LoadingSpinner label="Loading sales…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Sales</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New Sale</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search serial, customer, phone…" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-1 text-slate-400"><X className="h-4 w-4" /></button>}
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">All Sales</option>
          <option value="mapped">Mapped</option>
          <option value="pending_details">Pending Details</option>
        </select>
      </div>

      <p className="text-sm text-slate-500">{filtered.length} sales</p>

      {filtered.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-12 w-12" />} title="No sales recorded" subtitle="Record your first POS terminal sale." />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{s.terminal?.serial_number ?? '—'}</p>
                  <p className="text-xs text-slate-500">{s.customer?.full_name || 'No customer mapped'}</p>
                  <p className="text-xs text-slate-400">{s.sale_code} · {formatDate(s.sale_date)} · {s.agent?.full_name || 'Direct sale'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusChip label={MAPPING_LABELS[s.mapping_status]} color={MAPPING_COLORS[s.mapping_status]} />
                  {s.sale_price != null && <span className="text-sm font-semibold text-slate-700">{formatCurrency(s.sale_price)}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addOpen && <NewSaleModal onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

function NewSaleModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user, profile } = useAuth();
  const isFieldAgent = profile?.role === 'field_agent';
  const [serialSearch, setSerialSearch] = useState('');
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [channel, setChannel] = useState('direct');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fin, setFin] = useState<FinancePrefs>({ deliveryAmount: 0, deliveryRecipient: '', otherExpense: 0, deliveryNote: '' });
  const [bannerIssue, setBannerIssue] = useState<{ enabled: boolean; typeId: string; qty: number }>({ enabled: false, typeId: '', qty: 1 });

  useEffect(() => {
    // Load sellable terminals
    let q = supabase.from('terminals').select('*, agent:agents(*)').order('serial_number');
    if (isFieldAgent && profile?.agent_id) {
      q = q.eq('agent_id', profile.agent_id).in('status', ['assigned']);
    } else {
      q = q.in('status', ['available', 'assigned']);
    }
    q.then(({ data }) => setTerminals((data ?? []) as Terminal[]));
  }, [isFieldAgent, profile?.agent_id]);

  const filtered = terminals.filter((t) => !serialSearch || t.serial_number.includes(serialSearch.toUpperCase()));

  const selectTerminal = (t: Terminal) => {
    setSelectedTerminal(t);
    setSerialSearch(t.serial_number);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (!selectedTerminal) { setError('Select a terminal to sell'); setBusy(false); return; }

    // Verify terminal is sellable & not already sold
    const { data: verify } = await supabase.from('terminals').select('status, agent_id').eq('id', selectedTerminal.id).maybeSingle();
    const v = verify as { status: string; agent_id: string | null } | null;
    if (!v) { setError('Terminal not found'); setBusy(false); return; }
    if (v.status === 'sold') { setError('This terminal is already sold'); setBusy(false); return; }
    if (isFieldAgent && v.agent_id !== profile?.agent_id) { setError('You are not authorized to sell this terminal'); setBusy(false); return; }

    // Determine mapping status
    const hasFullDetails = customerName.trim() && customerPhone.trim();
    const mappingStatus = hasFullDetails ? 'mapped' : 'pending_details';

    const saleCode = generateCode('SAL');

    // Create or find customer
    let customerId: string | null = null;
    if (hasFullDetails) {
      const { data: cust, error: cErr } = await supabase.from('customers').insert({
        full_name: customerName.trim(),
        phone: customerPhone.trim() || null,
        email: customerEmail || null,
        state: customerState || null,
        city: customerCity || null,
        address: customerAddress || null,
        business_name: businessName || null,
        created_by: user?.id,
      }).select().single();
      if (cErr) { setError(cErr.message); setBusy(false); return; }
      customerId = (cust as { id: string }).id;
    }

    // Create sale
    const { data: sale, error: sErr } = await supabase.from('sales').insert({
      sale_code: saleCode,
      terminal_id: selectedTerminal.id,
      customer_id: customerId,
      agent_id: selectedTerminal.agent_id ?? (isFieldAgent ? profile?.agent_id : null),
      sale_date: new Date().toISOString().slice(0, 10),
      channel,
      sale_price: salePrice ? parseFloat(salePrice) : null,
      mapping_status: mappingStatus,
      recorded_by: user?.id,
      notes,
    }).select().single();
    if (sErr) { setError(sErr.message); setBusy(false); return; }
    const saleId = (sale as { id: string }).id;

    // Update terminal: mark sold
    const { error: tErr } = await supabase.from('terminals').update({
      status: 'sold',
      date_sold: new Date().toISOString().slice(0, 10),
      customer_id: customerId,
      sale_id: saleId,
      mapping_status: mappingStatus,
    }).eq('id', selectedTerminal.id);
    if (tErr) { setError(tErr.message); setBusy(false); return; }

    // Create movement
    await supabase.from('inventory_movements').insert({
      terminal_id: selectedTerminal.id,
      movement_type: 'sale',
      to_agent_id: null,
      sale_id: saleId,
      performed_by: user?.id,
      reference: saleCode,
      reason: `Sold to ${customerName || 'pending customer'}`,
    });

    // Notification
    if (user) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        category: 'sale',
        title: 'Terminal sold',
        body: `${selectedTerminal.serial_number} sold. Sale: ${saleCode}`,
        related_ref: saleCode,
      });
    }

    // Financial record (delivery cost + other expense). Atomic RPC, idempotent per sale.
    await recordSaleFinanceSafe(saleId, fin);

    // Banner issued with this sale (atomic RPC, idempotent per sale+type).
    if (bannerIssue.enabled && bannerIssue.typeId) {
      const { error: bErr } = await supabase.rpc('issue_banner_with_sale', {
        p_sale_id: saleId,
        p_banner_type_id: bannerIssue.typeId,
        p_quantity: Math.max(1, Math.floor(bannerIssue.qty || 1)),
        p_agent_id: selectedTerminal.agent_id ?? (isFieldAgent ? profile?.agent_id : null),
      });
      if (bErr) {
        // The sale itself succeeded — surface the banner failure but do not roll back the sale.
        setError(`Sale recorded, but the banner could not be issued: ${bErr.message}. You can issue it from the sale details later.`);
        setBusy(false);
        return;
      }
    }

    onDone();
    onClose();
    setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Record New Sale" size="lg">
      <div className="space-y-4">
        {/* Terminal selection */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">POS Terminal <span className="text-red-500">*</span></label>
          <input
            value={serialSearch}
            onChange={(e) => { setSerialSearch(e.target.value); setSelectedTerminal(null); }}
            placeholder="Search serial number…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="mt-2">
            <ScanButton onScan={(v) => setSerialSearch(v)} />
          </div>
          {!selectedTerminal && filtered.length > 0 && (
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {filtered.slice(0, 20).map((t) => (
                <button key={t.id} onClick={() => selectTerminal(t)} className="flex w-full items-center justify-between rounded p-1.5 text-left hover:bg-slate-50">
                  <span className="font-mono text-sm text-slate-700">{t.serial_number}</span>
                  <span className="text-xs text-slate-400">{t.status} · {t.agent?.full_name || 'warehouse'}</span>
                </button>
              ))}
            </div>
          )}
          {selectedTerminal && (
            <div className="mt-2 rounded-lg bg-purple-50 p-2">
              <p className="font-mono text-sm font-semibold text-purple-800">{selectedTerminal.serial_number}</p>
              <p className="text-xs text-purple-600">{selectedTerminal.model || 'No model'} · {selectedTerminal.agent?.full_name || 'Central stock'}</p>
            </div>
          )}
        </div>

        {/* Customer details */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Customer Details</p>
          <p className="mb-2 text-xs text-slate-400">Leave phone blank to save as "Pending Details" and complete later.</p>
          <div className="space-y-3">
            <Input label="Full Name" value={customerName} onChange={setCustomerName} placeholder="Customer name" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" value={customerPhone} onChange={setCustomerPhone} placeholder="0800..." />
              <Input label="Email" value={customerEmail} onChange={setCustomerEmail} type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="State" value={customerState} onChange={setCustomerState} />
              <Input label="City" value={customerCity} onChange={setCustomerCity} />
            </div>
            <Input label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Optional" />
            <Textarea label="Address" value={customerAddress} onChange={setCustomerAddress} rows={2} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Sale Price (₦)" value={salePrice} onChange={setSalePrice} type="number" placeholder="0.00" />
          <Select label="Channel" value={channel} onChange={setChannel} options={[{ value: 'direct', label: 'Direct' }, { value: 'agent', label: 'Agent' }, { value: 'partner', label: 'Partner' }]} />
        </div>
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />

        {/* Delivery cost & attributable expenses */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Delivery Cost & Expenses</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Agent Delivery Cost (₦)" value={String(fin.deliveryAmount || '')} onChange={(v) => setFin({ ...fin, deliveryAmount: parseFloat(v) || 0 })} type="number" placeholder="0.00" />
            <Input label="Paid To (recipient)" value={fin.deliveryRecipient} onChange={(v) => setFin({ ...fin, deliveryRecipient: v })} placeholder="Delivery person" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input label="Other Attributable Expense (₦)" value={String(fin.otherExpense || '')} onChange={(v) => setFin({ ...fin, otherExpense: parseFloat(v) || 0 })} type="number" placeholder="0.00" />
            <Input label="Expense / Delivery Note" value={fin.deliveryNote} onChange={(v) => setFin({ ...fin, deliveryNote: v })} placeholder="Optional note" />
          </div>
        </div>

        <BannerIssueSection value={bannerIssue} onChange={setBannerIssue} />

        {error && <ErrorBanner message={error} />}

        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !selectedTerminal} className="flex-1">
            {busy ? 'Processing…' : customerPhone ? 'Record Sale & Map Customer' : 'Record Sale (Pending Details)'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

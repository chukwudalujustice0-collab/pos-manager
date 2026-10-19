import { useEffect, useState, useCallback } from 'react';
import { supabase, type Expense, type CommissionPayment, type SaleFinance, type FinanceSettings, type Agent } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, ErrorBanner, Modal, Input, Select, Textarea, StatusChip } from '@/components/ui';
import { formatCurrency, formatDate, generateCode, classNames } from '@/lib/utils';
import { downloadCSV, readFileAsText } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';
import { Plus, FileDown, Wallet, CheckCircle2 } from 'lucide-react';

const EXPENSE_CATEGORIES = ['Transportation', 'Fuel', 'Packaging', 'Delivery', 'Other'];

export function FinanceAdmin({ tab, onBack }: { tab: 'expenses' | 'reconciliation' | 'settings'; onBack?: () => void }) {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const canEdit = profile?.role === 'owner' || profile?.role === 'inventory_manager';

  return (
    <div className="space-y-4">
      {onBack && <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>}
      {tab === 'expenses' && <ExpensesTab canEdit={canEdit} />}
      {tab === 'reconciliation' && <ReconciliationTab canEdit={canEdit} />}
      {tab === 'settings' && (isOwner ? <SettingsTab /> : <Card className="p-6 text-center text-sm text-slate-500">Only the owner can change financial settings.</Card>)}
    </div>
  );
}

// ============================================================
// Expenses
// ============================================================
function ExpensesTab({ canEdit }: { canEdit: boolean }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('expenses').select('*, agent:agents(*)').order('created_at', { ascending: false });
    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exportCSV = () => {
    downloadCSV(`expenses_${Date.now()}.csv`, [
      ['Date', 'Description', 'Category', 'Amount', 'Status', 'Payment Ref'],
      ...expenses.map((e) => [e.date_incurred, e.description, e.category, e.amount, e.status, e.payment_ref ?? '']),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Business Expenses</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>
          {canEdit && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Expense</Button>}
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingSpinner /> : expenses.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">No expenses recorded.</Card>
      ) : (
        <div className="space-y-2">
          {expenses.map((e) => (
            <Card key={e.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{e.description}</p>
                <p className="text-xs text-slate-400">{e.category} · {formatDate(e.date_incurred)}{e.agent?.full_name ? ` · ${e.agent.full_name}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700">{formatCurrency(e.amount)}</span>
                <StatusChip label={e.status} color={e.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : e.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {addOpen && <ExpenseModal onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

function ExpenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<Expense['status']>('unpaid');
  const [paymentRef, setPaymentRef] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('agents').select('*').eq('is_active', true).then(({ data }) => setAgents((data ?? []) as Agent[]));
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    if (!description.trim() || !amount) { setError('Description and amount are required.'); setBusy(false); return; }
    const { error } = await supabase.from('expenses').insert({
      description: description.trim(),
      category,
      amount: parseFloat(amount),
      date_incurred: date,
      status,
      payment_ref: paymentRef || null,
      agent_id: agentId || null,
      recorded_by: user?.id,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone(); onClose(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Add Business Expense">
      <div className="space-y-3">
        <Input label="Description" value={description} onChange={setDescription} placeholder="What was this expense for?" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Input label="Amount (₦)" value={amount} onChange={setAmount} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date Incurred" value={date} onChange={setDate} type="date" />
          <Select label="Payment Status" value={status} onChange={(v) => setStatus(v as Expense['status'])} options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Payment Reference" value={paymentRef} onChange={setPaymentRef} placeholder="Optional" />
          <Select label="Related Agent (optional)" value={agentId} onChange={setAgentId} placeholder="None" options={[{ value: '', label: 'None' }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))]} />
        </div>
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save Expense'}</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// Commission reconciliation
// ============================================================
function ReconciliationTab({ canEdit }: { canEdit: boolean }) {
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [finances, setFinances] = useState<SaleFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, f] = await Promise.all([
      supabase.from('commission_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('sale_finances').select('*, agent:agents(*)').order('sale_date', { ascending: false }),
    ]);
    setPayments((p.data ?? []) as CommissionPayment[]);
    setFinances((f.data ?? []) as SaleFinance[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const earned = finances.reduce((s, f) => s + Number(f.commission_earned), 0);
  const paidAmount = finances.reduce((s, f) => s + Number(f.commission_paid_amount), 0);
  const pending = earned - paidAmount;
  const unpaidCount = finances.filter((f) => f.commission_status !== 'received').length;
  const totalPaidIn = payments.reduce((s, p) => s + Number(p.amount), 0);

  const allocatePayment = async (payment: CommissionPayment) => {
    // Allocate payment across pending sale finances (oldest first), capped at payment amount
    const pendingFins = finances
      .filter((f) => Number(f.commission_paid_amount) < Number(f.commission_earned))
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date));
    let remaining = Number(payment.amount);
    const rows: { sale_finance_id: string; amount: number }[] = [];
    for (const f of pendingFins) {
      if (remaining <= 0) break;
      const owed = Number(f.commission_earned) - Number(f.commission_paid_amount);
      const alloc = Math.min(owed, remaining);
      rows.push({ sale_finance_id: f.id, amount: alloc });
      remaining -= alloc;
    }
    if (rows.length === 0) return;
    const { error } = await supabase.from('commission_payment_allocations').insert(
      rows.map((r) => ({ payment_id: payment.id, ...r }))
    );
    if (error) { setError(error.message); return; }
    // Update each finance row's paid amount + status
    for (const r of rows) {
      const f = finances.find((x) => x.id === r.sale_finance_id);
      if (!f) continue;
      const newPaid = Number(f.commission_paid_amount) + r.amount;
      await supabase.from('sale_finances').update({
        commission_paid_amount: newPaid,
        commission_status: newPaid >= Number(f.commission_earned) ? 'received' : 'pending',
      }).eq('id', f.id);
    }
    await load();
  };

  const exportCSV = () => {
    downloadCSV(`commission_reconciliation_${Date.now()}.csv`, [
      ['Payment Ref', 'Date', 'Amount', 'Payer', 'Notes'],
      ...payments.map((p) => [p.payment_reference, p.payment_date, p.amount, p.payer, p.notes ?? '']),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Commission Reconciliation</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-4 w-4" /> Export</Button>
          {canEdit && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Record Payment</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="p-3"><p className="text-xs text-slate-400">Commission Earned</p><p className="mt-1 font-bold text-slate-800">{formatCurrency(earned)}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-400">Received</p><p className="mt-1 font-bold text-emerald-700">{formatCurrency(paidAmount)}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-400">Pending</p><p className={classNames('mt-1 font-bold', pending > 0 ? 'text-amber-600' : 'text-slate-800')}>{formatCurrency(pending)}</p></Card>
        <Card className="p-3"><p className="text-xs text-slate-400">Unpaid Terminals</p><p className="mt-1 font-bold text-slate-800">{unpaidCount}</p></Card>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">Payment history ({formatCurrency(totalPaidIn)} total received)</p>
          {payments.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No commission payments recorded yet.</Card>}
          {payments.map((p) => (
            <Card key={p.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{p.payment_reference}</p>
                <p className="text-xs text-slate-400">{p.payer} · {formatDate(p.payment_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                <Button size="sm" variant="outline" onClick={() => allocatePayment(p)}><CheckCircle2 className="h-3.5 w-3.5" /> Allocate</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {addOpen && <PaymentModal onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

function PaymentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [reference, setReference] = useState(generateCode('CMP'));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [payer, setPayer] = useState('Wema Bank');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    if (!amount) { setError('Amount is required.'); setBusy(false); return; }
    const { error } = await supabase.from('commission_payments').insert({
      payment_reference: reference.trim(),
      amount: parseFloat(amount),
      payment_date: date,
      payer: payer.trim() || 'Wema Bank',
      notes: notes || null,
      recorded_by: user?.id,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone(); onClose(); setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Record Commission Payment">
      <div className="space-y-3">
        <Input label="Payment Reference" value={reference} onChange={setReference} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount (₦)" value={amount} onChange={setAmount} type="number" />
          <Input label="Payment Date" value={date} onChange={setDate} type="date" />
        </div>
        <Input label="Payer" value={payer} onChange={setPayer} />
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        {error && <ErrorBanner message={error} />}
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save Payment'}</Button>
      </div>
    </Modal>
  );
}

// ============================================================
// Financial settings (owner only)
// ============================================================
function SettingsTab() {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.from('finance_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('agents').select('*').eq('is_active', true),
    ]);
    setSettings(s.data as FinanceSettings);
    setAgents((a.data ?? []) as Agent[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!settings) return <LoadingSpinner />;

  const submit = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.from('finance_settings').update({
      selling_price: settings.selling_price,
      commission_per_terminal: settings.commission_per_terminal,
      recognition_rule: settings.recognition_rule,
      effective_from: settings.effective_from,
      delivery_rate_per_agent: Object.fromEntries(
        Object.entries(rates).filter(([, v]) => v !== '').map(([k, v]) => [k, parseFloat(v)])
      ),
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) { setError(error.message); setBusy(false); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Financial Settings</h1>
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-700">
        Changes apply to future sales only. Historical sales keep the rates recorded at sale time. A per-sale commission override can be set from the sale record.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Default Selling Price (₦)" value={String(settings.selling_price)} onChange={(v) => setSettings({ ...settings, selling_price: parseFloat(v) || 0 })} type="number" />
        <Input label="Commission per Terminal (₦)" value={String(settings.commission_per_terminal)} onChange={(v) => setSettings({ ...settings, commission_per_terminal: parseFloat(v) || 0 })} type="number" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Recognize commission when"
          value={settings.recognition_rule}
          onChange={(v) => setSettings({ ...settings, recognition_rule: v as FinanceSettings['recognition_rule'] })}
          options={[
            { value: 'on_sale_confirmed', label: 'Sale is confirmed' },
            { value: 'on_eligibility', label: 'Eligibility confirmed' },
            { value: 'on_payment', label: 'Payment received' },
          ]}
        />
        <Input label="Effective From" value={settings.effective_from} onChange={(v) => setSettings({ ...settings, effective_from: v })} type="date" />
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700"><Wallet className="mr-1 inline h-4 w-4" /> Per-agent delivery rates (optional default)</p>
        {agents.length === 0 && <p className="text-xs text-slate-400">No agents registered.</p>}
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-slate-600">{a.full_name}</span>
              <input
                value={rates[a.id] ?? ''}
                onChange={(e) => setRates({ ...rates, [a.id]: e.target.value })}
                placeholder="₦ default"
                type="number"
                className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {saved && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button onClick={submit} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save Financial Settings'}</Button>
    </div>
  );
}

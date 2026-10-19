import { useEffect, useState, useCallback } from 'react';
import { supabase, type Agent, type Terminal, type Transfer } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, EmptyState, Modal, Input, Select, Textarea, ErrorBanner, StatusChip } from '@/components/ui';
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_COLORS, formatDate, generateCode, classNames } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Users, Plus, ArrowRight, Package, User as UserIcon, Search, X, ScanLine, Copy, Check } from 'lucide-react';
import { ScanButton } from '@/components/ScanButton';

export function AgentsScreen() {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('agents').select('*').order('created_at', { ascending: false });
    if (!isStaff && profile?.agent_id) {
      q = q.eq('id', profile.agent_id);
    }
    const { data } = await q;
    setAgents((data ?? []) as Agent[]);
    setLoading(false);
  }, [isStaff, profile?.agent_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = agents.filter((a) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return a.full_name.toLowerCase().includes(s) || a.agent_code.toLowerCase().includes(s) || (a.phone?.includes(s) ?? false);
  });

  if (loading) return <LoadingSpinner label="Loading agents…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Agents</h1>
        {isStaff && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowRight className="h-4 w-4" /> Transfer
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Agent
            </Button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, phone…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-1 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title="No agents found" subtitle={isStaff ? "Add your first field agent to get started." : "You are not linked to an agent record."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={() => setSelected(a)} />
          ))}
        </div>
      )}

      {addOpen && <AddAgentModal onClose={() => setAddOpen(false)} onDone={load} />}
      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
      {transferOpen && <TransferModal onClose={() => setTransferOpen(false)} onDone={load} />}
    </div>
  );
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const [stock, setStock] = useState<number | null>(null);
  useEffect(() => {
    supabase.from('terminals').select('id', { count: 'exact', head: true }).eq('agent_id', agent.id).eq('status', 'assigned').then(({ count }) => setStock(count ?? 0));
  }, [agent.id]);

  return (
    <button onClick={onClick} className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-purple-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
            <UserIcon className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{agent.full_name}</p>
            <p className="text-xs text-slate-500">{agent.agent_code} · {agent.phone || 'No phone'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{stock ?? '…'}</p>
          <p className="text-xs text-slate-400">in stock</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {agent.is_active ? (
          <StatusChip label="Active" color="bg-emerald-100 text-emerald-700 border-emerald-200" />
        ) : (
          <StatusChip label="Inactive" color="bg-slate-100 text-slate-500 border-slate-200" />
        )}
        {agent.state && <span className="text-xs text-slate-400">{agent.state}{agent.city ? `, ${agent.city}` : ''}</span>}
      </div>
    </button>
  );
}

function AddAgentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [town, setTown] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [issuePassKey, setIssuePassKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const agentCode = generateCode('AGT');
    const { error: e } = await supabase.from('agents').insert({
      agent_code: agentCode,
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      state: state || null,
      city: city || null,
      town: town || null,
      area: area || null,
      address: address || null,
      notes: notes || null,
    });
    if (e) { setError(e.message); setBusy(false); return; }

    if (issuePassKey && phone) {
      const { data, error: invErr } = await supabase.rpc('create_invitation', {
        p_phone: phone.trim(),
        p_role: 'field_agent',
        p_expires_at: null,
        p_full_name: fullName.trim() || null,
      });
      if (invErr) {
        setError(`Agent saved, but pass key generation failed: ${invErr.message}`);
        setBusy(false);
        return;
      }
      const row = data as { pass_key?: string } | null;
      setGeneratedKey(row?.pass_key ?? null);
      setBusy(false);
      return;
    }

    onDone();
    onClose();
    setBusy(false);
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (generatedKey) {
    return (
      <Modal open={true} onClose={() => { onDone(); onClose(); }} title="Agent Added + Pass Key Generated">
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">{fullName} was added and an invitation pass key was generated.</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Share this pass key with {phone}:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono text-slate-800 break-all">{generatedKey}</code>
              <button onClick={copyKey} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Copy">
                {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">When the agent signs up with this key and their phone number, their account will be linked to the agent record you just created — no duplicate will be created.</p>
          <Button onClick={() => { onDone(); onClose(); }} className="w-full">Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title="Add Field Agent" size="lg">
      <div className="space-y-3">
        <Input label="Full Name" value={fullName} onChange={setFullName} required placeholder="Agent name" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={phone} onChange={setPhone} placeholder="0800..." />
          <Input label="Email" value={email} onChange={setEmail} type="email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="State" value={state} onChange={setState} />
          <Input label="City" value={city} onChange={setCity} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Town" value={town} onChange={setTown} />
          <Input label="Operating Area" value={area} onChange={setArea} />
        </div>
        <Textarea label="Address / Landmark" value={address} onChange={setAddress} rows={2} />
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        <label className="flex items-start gap-2 rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
          <input
            type="checkbox"
            checked={issuePassKey}
            onChange={(e) => setIssuePassKey(e.target.checked)}
            disabled={!phone}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600"
          />
          <span>
            Generate an invitation pass key for this agent
            {!phone && <span className="block text-xs text-amber-600">Enter a phone number to enable this.</span>}
          </span>
        </label>
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !fullName} className="flex-1">{busy ? 'Saving…' : 'Add Agent'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function AgentDetailModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [stats, setStats] = useState({ current: 0, sold: 0, returned: 0, damaged: 0, missing: 0 });
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [tab, setTab] = useState<'overview' | 'stock' | 'history'>('overview');

  useEffect(() => {
    supabase.from('terminals').select('id, status').eq('agent_id', agent.id).then(({ data }) => {
      const d = (data ?? []) as Pick<Terminal, 'id' | 'status'>[];
      setStats({
        current: d.filter((t) => t.status === 'assigned').length,
        sold: d.filter((t) => t.status === 'sold').length,
        returned: d.filter((t) => t.status === 'returned').length,
        damaged: d.filter((t) => t.status === 'damaged').length,
        missing: d.filter((t) => t.status === 'missing').length,
      });
    });
    supabase
      .from('terminals')
      .select('*, receipt_batch:receipt_batches(*)')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setTerminals((data ?? []) as Terminal[]));
    supabase
      .from('transfers')
      .select('*, source_location:locations!source_location_id(*), dest_location:locations!dest_location_id(*)')
      .or(`source_agent_id.eq.${agent.id},dest_agent_id.eq.${agent.id}`)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setTransfers((data ?? []) as Transfer[]));
  }, [agent.id]);

  return (
    <Modal open={true} onClose={onClose} title={agent.full_name} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusChip label={agent.agent_code} color="bg-purple-100 text-purple-700 border-purple-200" />
          {agent.is_active ? (
            <StatusChip label="Active" color="bg-emerald-100 text-emerald-700 border-emerald-200" />
          ) : (
            <StatusChip label="Inactive" color="bg-slate-100 text-slate-500 border-slate-200" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-400">Phone</p><p className="font-medium text-slate-700">{agent.phone || '—'}</p></div>
          <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-400">Location</p><p className="font-medium text-slate-700">{agent.state || '—'}{agent.city ? `, ${agent.city}` : ''}</p></div>
          <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-400">Registered</p><p className="font-medium text-slate-700">{formatDate(agent.created_at)}</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {(['overview', 'stock', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={classNames('px-3 py-2 text-sm font-medium capitalize', tab === t ? 'border-b-2 border-purple-600 text-purple-700' : 'text-slate-500')}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatBox label="Current Stock" value={stats.current} color="text-purple-700" />
            <StatBox label="Sold" value={stats.sold} color="text-violet-700" />
            <StatBox label="Returned" value={stats.returned} color="text-slate-700" />
            <StatBox label="Damaged" value={stats.damaged} color="text-red-700" />
            <StatBox label="Missing" value={stats.missing} color="text-red-700" />
          </div>
        )}

        {tab === 'stock' && (
          terminals.length === 0 ? <EmptyState title="No terminals held" /> : (
            <div className="space-y-1">
              {terminals.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                  <span className="font-mono text-sm text-slate-700">{t.serial_number}</span>
                  <StatusChip label={t.status} color="bg-slate-100 text-slate-600 border-slate-200" />
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'history' && (
          transfers.length === 0 ? <EmptyState title="No transfer history" /> : (
            <div className="space-y-2">
              {transfers.map((tr) => (
                <div key={tr.id} className="rounded-lg border border-slate-100 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{tr.transfer_code}</span>
                    <StatusChip label={TRANSFER_STATUS_LABELS[tr.status]} color={TRANSFER_STATUS_COLORS[tr.status]} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {tr.source_agent?.full_name || tr.source_location?.name || 'Warehouse'} → {tr.dest_agent?.full_name || tr.dest_location?.name || 'Warehouse'} · {formatDate(tr.dispatch_date)}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <p className={classNames('text-xl font-bold', color)}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function TransferModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [available, setAvailable] = useState<Terminal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [waybillRef, setWaybillRef] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('agents').select('*').eq('is_active', true).order('full_name').then(({ data }) => setAgents((data ?? []) as Agent[]));
    supabase
      .from('terminals')
      .select('*, location:locations(*)')
      .eq('status', 'available')
      .order('serial_number')
      .then(({ data }) => setAvailable((data ?? []) as Terminal[]));
  }, []);

  const filteredAvail = available.filter((t) => !search || t.serial_number.includes(search.toUpperCase()));

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (!agentId) { setError('Select a destination agent'); setBusy(false); return; }
    if (selected.size === 0) { setError('Select at least one terminal'); setBusy(false); return; }

    const transferCode = generateCode('TRF');
    const selectedIds = Array.from(selected);

    // Verify terminals are still available
    const { data: checkData } = await supabase.from('terminals').select('id, status').in('id', selectedIds);
    const stillAvailable = (checkData ?? []).every((t) => (t as { status: string }).status === 'available');
    if (!stillAvailable) {
      setError('One or more terminals are no longer available. Please refresh and try again.');
      setBusy(false);
      return;
    }

    // Create transfer
    const { data: transfer, error: tErr } = await supabase
      .from('transfers')
      .insert({
        transfer_code: transferCode,
        source_type: 'warehouse',
        dest_type: 'agent',
        dest_agent_id: agentId,
        qty_total: selectedIds.length,
        qty_received: 0,
        status: 'dispatched',
        dispatch_date: new Date().toISOString().slice(0, 10),
        waybill_ref: waybillRef || null,
        transferred_by: user?.id,
        notes,
      })
      .select()
      .single();
    if (tErr) { setError(tErr.message); setBusy(false); return; }
    const transferId = (transfer as { id: string }).id;

    // Create transfer items
    const items = selectedIds.map((tid) => ({ transfer_id: transferId, terminal_id: tid }));
    const { error: iErr } = await supabase.from('transfer_items').insert(items);
    if (iErr) { setError(iErr.message); setBusy(false); return; }

    // Update terminals: mark as assigned + in_transit (we use 'assigned' since dispatch = agent receives immediately in this workflow)
    const { error: uErr } = await supabase.from('terminals').update({ status: 'assigned', agent_id: agentId, date_assigned: new Date().toISOString().slice(0, 10) }).in('id', selectedIds);
    if (uErr) { setError(uErr.message); setBusy(false); return; }

    // Create movements
    const movements = selectedIds.map((tid) => ({
      terminal_id: tid,
      movement_type: 'dispatch' as const,
      to_agent_id: agentId,
      transfer_id: transferId,
      performed_by: user?.id,
      reference: transferCode,
      reason: 'Stock dispatch to agent',
    }));
    await supabase.from('inventory_movements').insert(movements);

    // Notification
    if (user) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        category: 'dispatch',
        title: 'Stock dispatched',
        body: `${selectedIds.length} terminals dispatched to agent. Transfer: ${transferCode}`,
        related_ref: transferCode,
      });
    }

    onDone();
    onClose();
    setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Dispatch Stock to Agent" size="lg">
      <div className="space-y-4">
        <Select label="Destination Agent" value={agentId} onChange={setAgentId} placeholder="Select agent" required options={agents.map((a) => ({ value: a.id, label: `${a.full_name} (${a.agent_code})` }))} />
        <Input label="Waybill / Dispatch Ref" value={waybillRef} onChange={setWaybillRef} placeholder="Optional reference" />

        {/* Terminal selection */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Select Terminals ({selected.size} selected)</label>
            {available.length > 0 && (
              <button onClick={() => setSelected(selected.size === available.length ? new Set() : new Set(available.map((t) => t.id)))} className="text-xs text-purple-600">
                {selected.size === available.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter serial number…"
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="mb-2">
            <ScanButton onScan={(v) => setSearch(v)} />
          </div>
          {available.length === 0 ? (
            <EmptyState icon={<Package className="h-10 w-10" />} title="No available terminals" subtitle="All terminals are assigned or sold." />
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {filteredAvail.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 rounded border-slate-300 text-purple-600" />
                  <span className="font-mono text-sm text-slate-700">{t.serial_number}</span>
                  {t.model && <span className="text-xs text-slate-400">{t.model}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? 'Dispatching…' : `Dispatch ${selected.size} Terminals`}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase, type Profile, type Location, type Invitation } from '@/lib/supabase';
import { Card, Button, Modal, Input, Select, LoadingSpinner, EmptyState, ErrorBanner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_RULES, loadSerialRules } from '@/lib/ocr';
import type { SerialRules } from '@/lib/scanner-types';
import { formatDate } from '@/lib/utils';
import { Settings as SettingsIcon, ChevronLeft, Plus, MapPin, UserCog, ScanLine, KeyRound, Copy, Check, Ban } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner (full access)' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'sales_officer', label: 'Sales Officer' },
  { value: 'field_agent', label: 'Field Agent' },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const isStaff = profile?.role !== 'field_agent';
  const [tab, setTab] = useState<'locations' | 'users' | 'serial' | 'invitations'>('locations');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('locations')} className={`px-3 py-2 text-sm font-medium ${tab === 'locations' ? 'border-b-2 border-purple-600 text-purple-700' : 'text-slate-500'}`}>
          Locations
        </button>
        {isOwner && (
          <button onClick={() => setTab('users')} className={`px-3 py-2 text-sm font-medium ${tab === 'users' ? 'border-b-2 border-purple-600 text-purple-700' : 'text-slate-500'}`}>
            User Management
          </button>
        )}
        {isOwner && (
          <button onClick={() => setTab('serial')} className={`px-3 py-2 text-sm font-medium ${tab === 'serial' ? 'border-b-2 border-purple-600 text-purple-700' : 'text-slate-500'}`}>
            Serial Format
          </button>
        )}
        {isStaff && (
          <button onClick={() => setTab('invitations')} className={`px-3 py-2 text-sm font-medium ${tab === 'invitations' ? 'border-b-2 border-purple-600 text-purple-700' : 'text-slate-500'}`}>
            Invitations
          </button>
        )}
      </div>

      {tab === 'locations' && <LocationsTab />}
      {tab === 'users' && isOwner && <UsersTab />}
      {tab === 'serial' && isOwner && <SerialRulesTab />}
      {tab === 'invitations' && isStaff && <InvitationsTab />}
    </div>
  );
}

function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('locations').select('*').order('name');
    setLocations((data ?? []) as Location[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Location</Button>
      {loading ? <LoadingSpinner /> : locations.length === 0 ? (
        <EmptyState icon={<MapPin className="h-10 w-10" />} title="No locations" subtitle="Add a warehouse or store where you keep stock." />
      ) : (
        <div className="space-y-2">
          {locations.map((l) => (
            <Card key={l.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{l.name}</p>
                <p className="text-xs text-slate-400 capitalize">{l.type}{l.city ? ` · ${l.city}` : ''}{l.state ? `, ${l.state}` : ''}</p>
              </div>
              {!l.is_active && <span className="text-xs text-slate-400">inactive</span>}
            </Card>
          ))}
        </div>
      )}
      {addOpen && <AddLocationModal onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

function AddLocationModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('warehouse');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('locations').insert({ name, type, state: state || null, city: city || null, address: address || null });
    if (error) { setError(error.message); setBusy(false); return; }
    onDone();
    onClose();
    setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Add Location">
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} placeholder="e.g. Main Warehouse" required />
        <Select label="Type" value={type} onChange={setType} options={[{ value: 'warehouse', label: 'Warehouse' }, { value: 'office', label: 'Office' }, { value: 'store', label: 'Store' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="State" value={state} onChange={setState} />
          <Input label="City" value={city} onChange={setCity} />
        </div>
        <Input label="Address" value={address} onChange={setAddress} />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !name} className="flex-1">{busy ? 'Saving…' : 'Add Location'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; agent_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: agentList }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('agents').select('id, full_name, agent_code').order('full_name'),
    ]);
    setUsers((profiles ?? []) as Profile[]);
    setAgents((agentList ?? []) as { id: string; full_name: string; agent_code: string }[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Staff sign-up: share your app URL and have each team member create an account, then assign their role here.
      </p>
      {loading ? <LoadingSpinner /> : users.length === 0 ? (
        <EmptyState icon={<UserCog className="h-10 w-10" />} title="No users found" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{u.full_name}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
                <span className="mt-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 capitalize">
                  {u.role.replace('_', ' ')}
                </span>
                {!u.is_active && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">disabled</span>}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditUser(u)}>Manage</Button>
            </Card>
          ))}
        </div>
      )}
      {editUser && <EditUserModal user={editUser} agents={agents} onClose={() => setEditUser(null)} onDone={load} />}
    </div>
  );
}

function EditUserModal({ user, agents, onClose, onDone }: { user: Profile; agents: { id: string; full_name: string; agent_code: string }[]; onClose: () => void; onDone: () => void }) {
  const { refreshProfile } = useAuth();
  const [role, setRole] = useState(user.role);
  const [agentId, setAgentId] = useState(user.agent_id ?? '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ role, agent_id: role === 'field_agent' ? agentId || null : null, is_active: isActive })
      .eq('id', user.id);
    if (error) { setError(error.message); setBusy(false); return; }
    await refreshProfile();
    onDone();
    onClose();
    setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title={`Manage ${user.full_name}`}>
      <div className="space-y-3">
        <Select label="Role" value={role} onChange={(v) => setRole(v as Profile['role'])} options={ROLE_OPTIONS} />
        {role === 'field_agent' && (
          <Select
            label="Linked Agent Record"
            value={agentId}
            onChange={setAgentId}
            placeholder="Select agent record"
            options={agents.map((a) => ({ value: a.id, label: `${a.full_name} (${a.agent_code})` }))}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-purple-600" />
          Account active (user can sign in)
        </label>
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? 'Saving…' : 'Save Changes'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function SerialRulesTab() {
  const [rules, setRules] = useState<SerialRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSerialRules().then(setRules);
  }, []);

  if (!rules) return <LoadingSpinner />;

  const save = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'serial_rules', value: rules, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) setError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-700">
        <p className="flex items-center gap-1.5 font-medium"><ScanLine className="h-4 w-4" /> Serial number format</p>
        <p className="mt-1 text-xs">These rules define what counts as a valid serial number when scanning with the camera and when typing manually. Check one of your actual POS labels and match the format here.</p>
      </div>
      <Input
        label="Prefix (leave empty for none)"
        value={rules.prefix}
        onChange={(v) => setRules({ ...rules, prefix: v.toUpperCase() })}
        placeholder="e.g. WEMA"
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Minimum length (after prefix)"
          type="number"
          value={String(rules.min_length)}
          onChange={(v) => setRules({ ...rules, min_length: parseInt(v) || 0 })}
        />
        <Input
          label="Maximum length (after prefix)"
          type="number"
          value={String(rules.max_length)}
          onChange={(v) => setRules({ ...rules, max_length: parseInt(v) || 0 })}
        />
      </div>
      <Select
        label="Characters allowed after prefix"
        value={rules.charset}
        onChange={(v) => setRules({ ...rules, charset: v as SerialRules['charset'] })}
        options={[
          { value: 'alphanumeric', label: 'Letters and numbers' },
          { value: 'digits', label: 'Numbers only' },
          { value: 'letters', label: 'Letters only' },
        ]}
      />
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Preview of a valid serial:</p>
        <p className="mt-1 font-mono">{rules.prefix}{'X'.repeat(Math.max(4, rules.min_length))}</p>
      </div>
      {error && <ErrorBanner message={error} />}
      {saved && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Serial Format'}</Button>
    </div>
  );
}

function InvitationsTab() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    setInvitations((data ?? []) as Invitation[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc('revoke_invitation', { p_invitation_id: id });
    if (!error) load();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-700">
        <p className="flex items-center gap-1.5 font-medium"><KeyRound className="h-4 w-4" /> Invitation Pass Keys</p>
        <p className="mt-1">Generate a pass key for each person you want to invite. Share the key and your app URL with them. The key is bound to a phone number and can only be used once. When the invitee signs up, their account is automatically linked to an existing agent record that matches their phone or email.</p>
      </div>
      <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Generate Pass Key</Button>

      {loading ? <LoadingSpinner /> : invitations.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-10 w-10" />} title="No invitations yet" subtitle="Generate a pass key to invite a team member or agent." />
      ) : (
        <div className="space-y-2">
          {invitations.map((inv) => (
            <InvitationCard key={inv.id} inv={inv} onRevoke={() => revoke(inv.id)} />
          ))}
        </div>
      )}
      {addOpen && <CreateInvitationModal onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

function InvitationCard({ inv, onRevoke }: { inv: Invitation; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    redeemed: 'bg-slate-100 text-slate-500 border-slate-200',
    expired: 'bg-amber-100 text-amber-700 border-amber-200',
    revoked: 'bg-red-100 text-red-700 border-red-200',
  };

  const copyKey = () => {
    navigator.clipboard.writeText(inv.pass_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusColors[inv.status] ?? statusColors.active}`}>{inv.status}</span>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 capitalize">{inv.role.replace('_', ' ')}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-800">{inv.full_name || 'Unnamed invitee'}</p>
          <p className="text-xs text-slate-400">{inv.phone}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700">{inv.pass_key}</code>
            <button onClick={copyKey} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Copy pass key">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {inv.redeemed_at && <p className="mt-1 text-xs text-slate-400">Redeemed {formatDate(inv.redeemed_at)}</p>}
        </div>
        {inv.status === 'active' && (
          <button onClick={onRevoke} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Revoke">
            <Ban className="h-4 w-4" />
          </button>
        )}
      </div>
    </Card>
  );
}

function CreateInvitationModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('field_agent');
  const [fullName, setFullName] = useState('');
  const [expiresIn, setExpiresIn] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data, error: rpcErr } = await supabase.rpc('create_invitation', {
      p_phone: phone.trim(),
      p_role: role,
      p_expires_at: expiresAt,
      p_full_name: fullName.trim() || null,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    const row = data as { pass_key?: string } | null;
    setGenerated(row?.pass_key ?? null);
    setBusy(false);
  };

  const copyKey = () => {
    if (generated) {
      navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (generated) {
    return (
      <Modal open={true} onClose={onClose} title="Pass Key Generated">
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">Invitation pass key created successfully!</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Share this pass key with {phone}:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono text-slate-800 break-all">{generated}</code>
              <button onClick={copyKey} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Copy">
                {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">The invitee must use this exact pass key along with the phone number {phone} when creating their account. The key works only once.</p>
          <div className="flex gap-2">
            <Button onClick={() => { onDone(); onClose(); }} className="flex-1">Done</Button>
            <Button variant="outline" onClick={() => { onDone(); setGenerated(null); }}>Generate Another</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title="Generate Invitation Pass Key">
      <div className="space-y-3">
        <Input label="Phone Number" value={phone} onChange={setPhone} placeholder="e.g. +2348012345678" required />
        <Input label="Full Name (optional)" value={fullName} onChange={setFullName} placeholder="Invitee name" />
        <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <Input label="Expires in (days, optional)" value={expiresIn} onChange={setExpiresIn} type="number" placeholder="Leave blank for no expiry" />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !phone} className="flex-1">{busy ? 'Generating…' : 'Generate Pass Key'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

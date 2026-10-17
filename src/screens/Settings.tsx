import { useEffect, useState, useCallback } from 'react';
import { supabase, type Profile, type Location } from '@/lib/supabase';
import { Card, Button, Modal, Input, Select, LoadingSpinner, EmptyState, ErrorBanner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_RULES, loadSerialRules } from '@/lib/ocr';
import type { SerialRules } from '@/lib/scanner-types';
import { Settings as SettingsIcon, ChevronLeft, Plus, MapPin, UserCog, ScanLine } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner (full access)' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'sales_officer', label: 'Sales Officer' },
  { value: 'field_agent', label: 'Field Agent' },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [tab, setTab] = useState<'locations' | 'users' | 'serial'>('locations');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('locations')} className={`px-3 py-2 text-sm font-medium ${tab === 'locations' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500'}`}>
          Locations
        </button>
        {isOwner && (
          <button onClick={() => setTab('users')} className={`px-3 py-2 text-sm font-medium ${tab === 'users' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500'}`}>
            User Management
          </button>
        )}
        {isOwner && (
          <button onClick={() => setTab('serial')} className={`px-3 py-2 text-sm font-medium ${tab === 'serial' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500'}`}>
            Serial Format
          </button>
        )}
      </div>

      {tab === 'locations' && <LocationsTab />}
      {tab === 'users' && isOwner && <UsersTab />}
      {tab === 'serial' && isOwner && <SerialRulesTab />}
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
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 capitalize">
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
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
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
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
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

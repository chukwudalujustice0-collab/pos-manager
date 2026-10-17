import { useEffect, useState } from 'react';
import { supabase, type BannerType, type BannerBalance } from '@/lib/supabase';
import { Input } from '@/components/ui';

/**
 * Shared "issue banner with sale" section for the sale workflow.
 * Loads active banner types + the selected agent's available balance so
 * the user sees exactly how much stock the agent can issue from.
 */
export function BannerIssueSection({
  value,
  onChange,
  agentId,
}: {
  value: { enabled: boolean; typeId: string; qty: number };
  onChange: (v: { enabled: boolean; typeId: string; qty: number }) => void;
  agentId?: string | null;
}) {
  const [types, setTypes] = useState<BannerType[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('banner_types').select('*').eq('is_active', true).then(({ data }) => setTypes((data ?? []) as BannerType[]));
  }, []);

  useEffect(() => {
    if (!value.enabled || !value.typeId) { setBalance(null); return; }
    let q = supabase.from('banner_balances').select('quantity');
    if (agentId) {
      q = q.eq('agent_id', agentId);
    } else {
      q = q.is('agent_id', null);
    }
    q.eq('banner_type_id', value.typeId).maybeSingle().then(({ data }) => {
      setBalance(data ? (data as BannerBalance).quantity : 0);
    });
  }, [value.enabled, value.typeId, agentId]);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked, typeId: e.target.checked && !value.typeId && types[0] ? types[0].id : value.typeId, qty: e.target.checked ? value.qty || 1 : value.qty })}
          className="h-4 w-4 rounded border-slate-300"
        />
        Banner issued with this sale
      </label>
      {value.enabled && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Banner Type</label>
              <select
                value={value.typeId}
                onChange={(e) => onChange({ ...value, typeId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select banner type…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <Input label="Quantity Issued" value={String(value.qty)} onChange={(v) => onChange({ ...value, qty: parseInt(v) || 1 })} type="number" />
          </div>
          {balance !== null && value.typeId && (
            <p className={`text-xs ${balance >= value.qty ? 'text-slate-500' : 'text-red-600 font-medium'}`}>
              {agentId ? 'Agent' : 'Warehouse'} available: {balance}
              {balance < value.qty && ' — not enough stock; the issue will be rejected.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Loads banner types for the issue flow. */
export async function loadBannerTypesForIssue(): Promise<BannerType[]> {
  const { data } = await supabase.from('banner_types').select('*').eq('is_active', true).order('name');
  return (data ?? []) as BannerType[];
}

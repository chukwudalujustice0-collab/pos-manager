import { useEffect, useState, useCallback } from 'react';
import { supabase, type Terminal, type Agent } from '@/lib/supabase';
import { Card, LoadingSpinner, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { NavTab } from '@/components/AppShell';
import { Boxes, Users, ShoppingCart, AlertTriangle, TrendingUp, PackageCheck, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Metrics {
  totalReceived: number;
  inWarehouse: number;
  withAgents: number;
  sold: number;
  mapped: number;
  pendingDetails: number;
  unassigned: number;
  inTransit: number;
  damaged: number;
  returned: number;
  missing: number;
  totalAgents: number;
  activeAgents: number;
}

interface RecentActivity {
  type: string;
  description: string;
  date: string;
  ref: string;
}

export function Dashboard({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: terminals }, { data: agentsData }, { data: movements }] = await Promise.all([
      supabase.from('terminals').select('status, agent_id, mapping_status'),
      supabase.from('agents').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory_movements').select('movement_type, reference, created_at, terminal:terminals(serial_number)').order('created_at', { ascending: false }).limit(10),
    ]);

    const ts = (terminals ?? []) as Pick<Terminal, 'status' | 'agent_id' | 'mapping_status'>[];
    const count = (s: Terminal['status']) => ts.filter((t) => t.status === s).length;

    setMetrics({
      totalReceived: ts.length,
      inWarehouse: count('available') + count('returned'),
      withAgents: count('assigned'),
      sold: count('sold'),
      mapped: ts.filter((t) => t.status === 'sold' && t.mapping_status === 'mapped').length,
      pendingDetails: ts.filter((t) => t.status === 'sold' && t.mapping_status === 'pending_details').length,
      unassigned: count('available'),
      inTransit: count('in_transit'),
      damaged: count('damaged'),
      returned: count('returned'),
      missing: count('missing'),
      totalAgents: agentsData?.length ?? 0,
      activeAgents: agentsData?.filter((a) => a.is_active).length ?? 0,
    });

    setAgents(agentsData ?? []);

    const activityMap: Record<string, string> = {
      receipt: 'Stock received',
      dispatch: 'Stock dispatched',
      transfer_receive: 'Transfer received',
      sale: 'Terminal sold',
      return: 'Terminal returned',
      damage: 'Damaged reported',
      missing: 'Missing reported',
      correction: 'Correction made',
      reassign: 'Reassigned',
    };
    setRecent(
      (movements ?? []).map((m) => ({
        type: m.movement_type,
        description: `${activityMap[m.movement_type] ?? m.movement_type}: ${(m.terminal as unknown as { serial_number: string })?.serial_number ?? '—'}`,
        date: m.created_at,
        ref: m.reference ?? '',
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner label="Loading dashboard…" />;

  if (!metrics || metrics.totalReceived === 0) {
    return (
      <EmptyState
        icon={<Boxes className="h-12 w-12" />}
        title="No terminals in inventory yet"
        subtitle="Receive your first batch of POS terminals to get started. Go to More → Receive Stock."
      />
    );
  }

  const cards: { label: string; value: number; icon: LucideIcon; color: string; tab?: NavTab; status?: Terminal['status'] }[] = [
    { label: 'Total Received', value: metrics.totalReceived, icon: PackageCheck, color: 'bg-purple-50 text-purple-700', tab: 'inventory' },
    { label: 'In Warehouse', value: metrics.inWarehouse, icon: Boxes, color: 'bg-emerald-50 text-emerald-700', tab: 'inventory', status: 'available' },
    { label: 'With Agents', value: metrics.withAgents, icon: Users, color: 'bg-purple-50 text-purple-700', tab: 'agents' },
    { label: 'Sold', value: metrics.sold, icon: ShoppingCart, color: 'bg-violet-50 text-violet-700', tab: 'sales' },
    { label: 'Mapped to Customers', value: metrics.mapped, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-700', tab: 'sales' },
    { label: 'Pending Details', value: metrics.pendingDetails, icon: AlertTriangle, color: 'bg-amber-50 text-amber-700', tab: 'sales' },
    { label: 'In Transit', value: metrics.inTransit, icon: ArrowLeftRight, color: 'bg-amber-50 text-amber-700', tab: 'inventory', status: 'in_transit' },
    { label: 'Damaged / Missing', value: metrics.damaged + metrics.missing, icon: AlertTriangle, color: 'bg-red-50 text-red-700', tab: 'inventory', status: 'damaged' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={() => c.tab && onNavigate(c.tab)}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
            >
              <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-2xl font-bold text-slate-900">{c.value}</span>
              <span className="text-xs text-slate-500">{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Agent stock summary */}
      {agents.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Agent Stock Balances</h2>
          <div className="space-y-2">
            {agents.slice(0, 5).map((a) => (
              <AgentStockRow key={a.id} agentId={a.id} name={a.full_name} code={a.agent_code} active={a.is_active} />
            ))}
          </div>
        </Card>
      )}

      {/* Recent activity */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                <div>
                  <p className="text-sm text-slate-700">{r.description}</p>
                  {r.ref && <p className="text-xs text-slate-400">Ref: {r.ref}</p>}
                </div>
                <span className="text-xs text-slate-400">{formatDate(r.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AgentStockRow({ agentId, name, code, active }: { agentId: string; name: string; code: string; active: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('terminals')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'assigned')
      .then(({ count }) => setBalance(count ?? 0));
  }, [agentId]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-700">{name}</p>
        <p className="text-xs text-slate-400">{code}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{balance ?? '…'}</span>
        <span className="text-xs text-slate-400">in stock</span>
        {!active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">inactive</span>}
      </div>
    </div>
  );
}

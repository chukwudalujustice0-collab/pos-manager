import { useEffect, useState, useCallback } from 'react';
import { supabase, type AuditEvent } from '@/lib/supabase';
import { LoadingSpinner, EmptyState, StatusChip } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Shield, ChevronLeft } from 'lucide-react';

export function AuditScreen({ onBack }: { onBack: () => void }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setEvents((data ?? []) as AuditEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Audit Trail</h1>
      </div>
      <p className="text-sm text-slate-500">Record of corrections, status changes and sensitive operations.</p>

      {loading ? <LoadingSpinner /> : events.length === 0 ? (
        <EmptyState icon={<Shield className="h-12 w-12" />} title="No audit events yet" subtitle="Corrections and status changes will appear here." />
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800 capitalize">{e.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400">{e.entity_type} · {formatDateTime(e.created_at)}</p>
                </div>
                {e.entity_type === 'terminal' && (
                  <StatusChip label={e.entity_type} color="bg-slate-100 text-slate-600 border-slate-200" />
                )}
              </div>
              {e.details && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

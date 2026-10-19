import { useEffect, useState } from 'react';
import { supabase, type Terminal } from '@/lib/supabase';
import { Modal, LoadingSpinner, EmptyState } from '@/components/ui';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { Search, ScanLine } from 'lucide-react';
import { SingleScanModal } from '@/screens/SingleScanModal';
import { TerminalDetailModal } from '@/screens/TerminalDetailModal';

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [results, setResults] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Terminal | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('terminals')
        .select('*, agent:agents(*), location:locations(*), receipt_batch:receipt_batches(*)')
        .or(`serial_number.ilike.%${query}%,model.ilike.%${query}%`)
        .limit(20);
      if (!error) setResults((data ?? []) as Terminal[]);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <Modal open={true} onClose={onClose} title="Universal Search" size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search serial number, model…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={() => setScanOpen(true)}
              className="absolute right-2 top-1.5 flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700"
            >
              <ScanLine className="h-3.5 w-3.5" /> Scan
            </button>
          </div>

          {loading && <LoadingSpinner />}

          {!loading && query.length >= 2 && results.length === 0 && (
            <EmptyState title="No terminals found" subtitle="Try a different search term" />
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-2 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-800">{t.serial_number}</p>
                    <p className="text-xs text-slate-400">{t.agent?.full_name || t.location?.name || 'Unassigned'}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!loading && query.length < 2 && (
            <p className="text-center text-sm text-slate-400 py-8">Type at least 2 characters to search</p>
          )}
        </div>
      </Modal>
      {selected && <TerminalDetailModal terminal={selected} onClose={() => setSelected(null)} onChanged={() => {}} />}
      {scanOpen && (
        <SingleScanModal
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onResult={(v) => { setQuery(v); setScanOpen(false); }}
        />
      )}
    </>
  );
}

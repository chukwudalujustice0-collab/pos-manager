import { useEffect, useState, useCallback } from 'react';
import { supabase, type Customer, type Sale } from '@/lib/supabase';
import { LoadingSpinner, EmptyState, Button, StatusChip, Modal, Input, Textarea, ErrorBanner, Card } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Users, ChevronLeft, Search, X, FileDown } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';

export function CustomersScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    setCustomers((data ?? []) as Customer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.full_name.toLowerCase().includes(s) ||
      (c.phone?.includes(s) ?? false) ||
      (c.email?.toLowerCase().includes(s) ?? false) ||
      (c.business_name?.toLowerCase().includes(s) ?? false);
  });

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Name', 'Phone', 'Email', 'State', 'City', 'Business', 'Address', 'Registered'],
      ...filtered.map((c) => [c.full_name, c.phone, c.email, c.state, c.city, c.business_name, c.address, formatDate(c.created_at)]),
    ];
    downloadCSV(`customers_${Date.now()}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        {customers.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto"><FileDown className="h-4 w-4" /> Export</Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-1 text-slate-400"><X className="h-4 w-4" /></button>}
      </div>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title="No customers yet" subtitle="Customers are created when you record sales." />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-purple-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.business_name || c.full_name}</p>
                  <p className="text-xs text-slate-500">{c.phone || 'No phone'} {c.email ? `· ${c.email}` : ''}</p>
                  <p className="text-xs text-slate-400">{c.state || ''}{c.city ? `, ${c.city}` : ''}</p>
                </div>
                <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('sales')
      .select('*, terminal:terminals(*)')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSales((data ?? []) as Sale[]);
        setLoading(false);
      });
  }, [customer.id]);

  return (
    <Modal open={true} onClose={onClose} title={customer.full_name} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">Phone</p><p className="font-medium text-slate-700">{customer.phone || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Email</p><p className="font-medium text-slate-700">{customer.email || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Business</p><p className="font-medium text-slate-700">{customer.business_name || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Location</p><p className="font-medium text-slate-700">{customer.state || '—'}{customer.city ? `, ${customer.city}` : ''}</p></div>
        </div>
        {customer.address && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><p className="mb-1 text-xs font-semibold text-slate-400">Address</p>{customer.address}</div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Purchased Terminals ({sales.length})</h3>
          {loading ? <LoadingSpinner /> : sales.length === 0 ? (
            <p className="text-sm text-slate-400">No terminals purchased</p>
          ) : (
            <div className="space-y-1">
              {sales.map((s) => {
                const t = s.terminal as unknown as { serial_number: string } | undefined;
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                    <span className="font-mono text-sm text-slate-700">{t?.serial_number ?? '—'}</span>
                    <span className="text-xs text-slate-400">{formatDate(s.sale_date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase, type Terminal, type TerminalStatus } from '@/lib/supabase';
import { Card, Button, LoadingSpinner, EmptyState, StatusChip, Modal, Input, Select, Textarea, ErrorBanner } from '@/components/ui';
import { STATUS_LABELS, STATUS_COLORS, formatDate, classNames, generateCode } from '@/lib/utils';
import { parseSerialInput, isValidSerial } from '@/lib/csv';
import { Boxes, Plus, Upload, FileDown, Search, X, ScanLine } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TerminalDetailModal } from '@/screens/TerminalDetailModal';
import { BulkScanModal } from '@/screens/BulkScanModal';
import { ScanButton } from '@/components/ScanButton';

type FilterStatus = TerminalStatus | 'all' | 'pending_details';

export function InventoryScreen() {
  const { profile } = useAuth();
  const isStaff = profile?.role !== 'field_agent';
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<string[] | null>(null);
  const [singleOpen, setSingleOpen] = useState(false);
  const [selected, setSelected] = useState<Terminal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('terminals')
      .select('*, agent:agents(*), location:locations(*), receipt_batch:receipt_batches(*)')
      .order('created_at', { ascending: false });
    if (!isStaff) {
      q = q.eq('agent_id', profile?.agent_id ?? '');
    }
    const { data, error } = await q;
    if (error) {
      console.error(error);
    }
    setTerminals((data ?? []) as Terminal[]);
    setLoading(false);
  }, [isStaff, profile?.agent_id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = terminals.filter((t) => {
    if (filter === 'pending_details') {
      return t.status === 'sold' && t.mapping_status === 'pending_details';
    }
    if (filter !== 'all' && t.status !== filter) return false;
    if (search) {
      const s = search.toUpperCase();
      return t.serial_number.includes(s) || (t.model?.toUpperCase().includes(s) ?? false);
    }
    return true;
  });

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All Terminals' },
    { value: 'available', label: 'In Warehouse' },
    { value: 'assigned', label: 'With Agents' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'sold', label: 'Sold' },
    { value: 'pending_details', label: 'Pending Details' },
    { value: 'returned', label: 'Returned' },
    { value: 'damaged', label: 'Damaged' },
    { value: 'missing', label: 'Missing' },
  ];

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [
      ['Serial Number', 'Model', 'Status', 'Agent', 'Location', 'Date Received', 'Date Sold', 'Mapping', 'Supplier'],
      ...filtered.map((t) => [
        t.serial_number,
        t.model,
        STATUS_LABELS[t.status],
        t.agent?.full_name ?? '',
        t.location?.name ?? '',
        formatDate(t.date_received),
        formatDate(t.date_sold),
        t.mapping_status ?? '',
        t.supplier ?? '',
      ]),
    ];
    import('@/lib/csv').then(({ downloadCSV }) => downloadCSV(`inventory_${Date.now()}.csv`, rows));
  };

  if (loading) return <LoadingSpinner label="Loading inventory…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
        {isStaff && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSingleOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setScanPrefill(null); setScanOpen(true); }}>
              <ScanLine className="h-4 w-4" /> Scan Serial Numbers
            </Button>
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search serial number…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterStatus)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {filterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500">{filtered.length} terminals</p>

      {filtered.length === 0 ? (
        <EmptyState icon={<Boxes className="h-12 w-12" />} title="No terminals found" subtitle="Adjust filters or import a new batch." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{t.serial_number}</p>
                  <p className="text-xs text-slate-500">
                    {t.model || 'No model'} · {t.agent?.full_name || t.location?.name || 'Unassigned'}
                  </p>
                </div>
                <StatusChip label={STATUS_LABELS[t.status]} color={STATUS_COLORS[t.status]} />
              </div>
              {t.exception_flag && (
                <p className="mt-1 text-xs text-red-600">⚠ Exception flagged</p>
              )}
            </button>
          ))}
        </div>
      )}

      {importOpen && (
        <BulkImportModal
          onClose={() => { setImportOpen(false); setScanPrefill(null); }}
          onDone={() => { setImportOpen(false); setScanPrefill(null); load(); }}
          prefillSerials={scanPrefill}
          onOpenScanner={() => { setScanPrefill(null); setImportOpen(false); setScanOpen(true); }}
        />
      )}
      {scanOpen && (
        <BulkScanModal
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onConfirm={(serials) => {
            setScanPrefill(serials);
            setScanOpen(false);
            setImportOpen(true);
          }}
        />
      )}
      {singleOpen && <SingleTerminalModal onClose={() => setSingleOpen(false)} onDone={load} />}
      {selected && <TerminalDetailModal terminal={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

function BulkImportModal({ onClose, onDone, prefillSerials, onOpenScanner }: { onClose: () => void; onDone: () => void; prefillSerials?: string[] | null; onOpenScanner: () => void }) {
  const { user } = useAuth();
  const [rawText, setRawText] = useState(prefillSerials?.length ? prefillSerials.join('\n') : '');
  const [supplier, setSupplier] = useState('');
  const [deliveryRef, setDeliveryRef] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [parsed, setParsed] = useState<{ valid: string[]; duplicateInBatch: string[]; invalid: string[]; existing: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; batchCode: string } | null>(null);

  useEffect(() => {
    supabase.from('locations').select('id, name').eq('is_active', true).then(({ data }) => setLocations(data ?? []));
  }, []);

  // If serials came from the scanner review screen, validate immediately
  useEffect(() => {
    if (prefillSerials && prefillSerials.length > 0) {
      parseAndCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSerials]);

  const parseAndCheck = async () => {
    setChecking(true);
    setError(null);
    const serials = parseSerialInput(rawText);
    if (serials.length === 0) {
      setError('Please paste at least one serial number.');
      setChecking(false);
      return;
    }

    const seen = new Set<string>();
    const valid: string[] = [];
    const duplicateInBatch: string[] = [];
    const invalid: string[] = [];

    for (const s of serials) {
      if (!isValidSerial(s)) {
        invalid.push(s);
        continue;
      }
      if (seen.has(s)) {
        duplicateInBatch.push(s);
        continue;
      }
      seen.add(s);
      valid.push(s);
    }

    // Check existing in DB
    let existing: string[] = [];
    if (valid.length > 0) {
      const { data: existingData } = await supabase
        .from('terminals')
        .select('serial_number')
        .in('serial_number', valid);
      existing = (existingData ?? []).map((r) => (r as { serial_number: string }).serial_number);
    }

    const trulyNew = valid.filter((s) => !existing.includes(s));
    setParsed({ valid: trulyNew, duplicateInBatch, invalid, existing });
    setChecking(false);
  };

  const confirmImport = async () => {
    if (!parsed) return;
    setSaving(true);
    setError(null);
    const batchCode = generateCode('RCB');
    const terminalsToCreate = parsed.valid;

    try {
      // Create receipt batch
      const { data: batch, error: batchErr } = await supabase
        .from('receipt_batches')
        .insert({
          batch_code: batchCode,
          supplier: supplier || 'Unknown',
          delivery_ref: deliveryRef || null,
          qty_expected: terminalsToCreate.length,
          qty_received: terminalsToCreate.length,
          location_id: locationId || null,
          notes: notes || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (batchErr) throw new Error(batchErr.message);
      const batchId = (batch as { id: string }).id;

      // Insert terminals
      if (terminalsToCreate.length > 0) {
        const rows = terminalsToCreate.map((sn) => ({
          serial_number: sn,
          receipt_batch_id: batchId,
          supplier: supplier || 'Unknown',
          date_received: new Date().toISOString().slice(0, 10),
          status: 'available' as TerminalStatus,
          location_id: locationId || null,
        }));
        const { error: termErr } = await supabase.from('terminals').insert(rows);
        if (termErr) throw new Error(termErr.message);

        // Create inventory movements
        const movements = terminalsToCreate.map((sn) => ({
          terminal_serial: sn,
        }));
        // We need terminal IDs — query them
        const { data: newTerms } = await supabase
          .from('terminals')
          .select('id, serial_number')
          .in('serial_number', terminalsToCreate)
          .eq('receipt_batch_id', batchId);
        if (newTerms && newTerms.length > 0) {
          const movRows = (newTerms as { id: string }[]).map((t) => ({
            terminal_id: t.id,
            movement_type: 'receipt' as const,
            to_location_id: locationId || null,
            receipt_batch_id: batchId,
            performed_by: user?.id,
            reference: batchCode,
            reason: 'Bulk import',
          }));
          await supabase.from('inventory_movements').insert(movRows);
        }
        void movements;
      }

      // Notification
      if (user) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          category: 'receipt',
          title: 'Stock receipt completed',
          body: `${terminalsToCreate.length} terminals received in batch ${batchCode}`,
          related_ref: batchCode,
        });
      }

      setResult({ created: terminalsToCreate.length, batchCode });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
    setSaving(false);
  };

  if (result) {
    return (
      <Modal open={true} onClose={onClose} title="Import Complete">
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 p-4 text-center">
            <p className="text-3xl font-bold text-emerald-700">{result.created}</p>
            <p className="text-sm text-emerald-600">terminals added to inventory</p>
          </div>
          <p className="text-sm text-slate-600">Batch code: <span className="font-mono font-semibold">{result.batchCode}</span></p>
          {parsed && (
            <div className="space-y-1 text-sm">
              {parsed.duplicateInBatch.length > 0 && <p className="text-amber-600">{parsed.duplicateInBatch.length} duplicates in batch skipped</p>}
              {parsed.invalid.length > 0 && <p className="text-red-600">{parsed.invalid.length} invalid entries skipped</p>}
              {parsed.existing.length > 0 && <p className="text-slate-600">{parsed.existing.length} already in database skipped</p>}
            </div>
          )}
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title="Bulk Import Serial Numbers" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Paste serial numbers below — one per line. Also supports comma, tab, or spreadsheet-column paste.
        </p>
        <Input label="Supplier" value={supplier} onChange={setSupplier} placeholder="e.g. Wema Bank" required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Delivery Reference" value={deliveryRef} onChange={setDeliveryRef} placeholder="Waybill no." />
          <Select
            label="Receiving Location"
            value={locationId}
            onChange={setLocationId}
            placeholder="Select location"
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
        <Textarea
          label="Serial Numbers"
          value={rawText}
          onChange={setRawText}
          placeholder={'WEMA001234\nWEMA001235\nWEMA001236'}
          rows={8}
          required
        />
        <Button variant="secondary" onClick={onOpenScanner} className="w-full">
          <ScanLine className="h-4 w-4" /> Scan Serial Numbers
        </Button>
        <Textarea label="Notes" value={notes} onChange={setNotes} placeholder="Optional notes" rows={2} />

        {error && <ErrorBanner message={error} />}

        {parsed && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Import Preview</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-emerald-100 p-2">
                <p className="font-bold text-emerald-700">{parsed.valid.length}</p>
                <p className="text-xs text-emerald-600">New & valid</p>
              </div>
              <div className="rounded bg-amber-100 p-2">
                <p className="font-bold text-amber-700">{parsed.duplicateInBatch.length}</p>
                <p className="text-xs text-amber-600">Duplicates in batch</p>
              </div>
              <div className="rounded bg-slate-200 p-2">
                <p className="font-bold text-slate-700">{parsed.existing.length}</p>
                <p className="text-xs text-slate-600">Already registered</p>
              </div>
              <div className="rounded bg-red-100 p-2">
                <p className="font-bold text-red-700">{parsed.invalid.length}</p>
                <p className="text-xs text-red-600">Invalid format</p>
              </div>
            </div>
            {parsed.invalid.length > 0 && (
              <p className="text-xs text-red-500">Invalid: {parsed.invalid.slice(0, 10).join(', ')}{parsed.invalid.length > 10 ? '…' : ''}</p>
            )}
            {parsed.existing.length > 0 && (
              <p className="text-xs text-slate-500">Existing: {parsed.existing.slice(0, 10).join(', ')}{parsed.existing.length > 10 ? '…' : ''}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!parsed ? (
            <Button onClick={parseAndCheck} disabled={checking || !rawText} className="flex-1">
              {checking ? 'Validating…' : 'Validate & Preview'}
            </Button>
          ) : (
            <Button onClick={confirmImport} disabled={saving || parsed.valid.length === 0} className="flex-1">
              {saving ? 'Saving…' : `Import ${parsed.valid.length} Terminals`}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function SingleTerminalModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [serial, setSerial] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [model, setModel] = useState('');
  const [supplier, setSupplier] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('locations').select('id, name').eq('is_active', true).then(({ data }) => setLocations(data ?? []));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const sn = serial.trim().toUpperCase();
    if (!isValidSerial(sn)) {
      setError('Invalid serial number format');
      setBusy(false);
      return;
    }
    const { data: existing } = await supabase.from('terminals').select('id').eq('serial_number', sn).maybeSingle();
    if (existing) {
      setError('A terminal with this serial number already exists');
      setBusy(false);
      return;
    }
    const batchCode = generateCode('RCB');
    const { data: batch, error: bErr } = await supabase
      .from('receipt_batches')
      .insert({ batch_code: batchCode, supplier: supplier || 'Unknown', qty_expected: 1, qty_received: 1, location_id: locationId || null, notes, created_by: user?.id })
      .select()
      .single();
    if (bErr) { setError(bErr.message); setBusy(false); return; }
    const batchId = (batch as { id: string }).id;

    const { data: term, error: tErr } = await supabase
      .from('terminals')
      .insert({
        serial_number: sn,
        model: model || null,
        receipt_batch_id: batchId,
        supplier: supplier || 'Unknown',
        date_received: new Date().toISOString().slice(0, 10),
        status: 'available',
        location_id: locationId || null,
        notes,
      })
      .select()
      .single();
    if (tErr) { setError(tErr.message); setBusy(false); return; }
    const termId = (term as { id: string }).id;
    await supabase.from('inventory_movements').insert({
      terminal_id: termId,
      movement_type: 'receipt',
      to_location_id: locationId || null,
      receipt_batch_id: batchId,
      performed_by: user?.id,
      reference: batchCode,
      reason: 'Manual entry',
    });
    onDone();
    onClose();
    setBusy(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="Add Single Terminal">
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Input label="Serial Number" value={serial} onChange={setSerial} placeholder="WEMA001234" required /></div>
          <ScanButton onScan={(v) => setSerial(v)} />
        </div>
        {serial && !isValidSerial(serial) && (
          <p className="text-xs text-amber-600">Unusual format — please double-check against the label.</p>
        )}
        <Input label="Model" value={model} onChange={setModel} placeholder="e.g. PAX D210" />
        <Input label="Supplier" value={supplier} onChange={setSupplier} placeholder="e.g. Wema Bank" />
        <Select label="Location" value={locationId} onChange={setLocationId} placeholder="Select location" options={locations.map((l) => ({ value: l.id, label: l.name }))} />
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !serial} className="flex-1">{busy ? 'Saving…' : 'Add Terminal'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

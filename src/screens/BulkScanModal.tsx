import { useRef, useState, useEffect } from 'react';
import {
  Camera, Upload, FileUp, Loader2, RotateCcw, Trash2, Copy, Plus, CheckCircle2,
  AlertTriangle, XCircle, Pencil, ZoomIn,
} from 'lucide-react';
import { Modal, Button, Input, ErrorBanner } from '@/components/ui';
import { runSheetOCR, loadSerialRules, ambiguousPositions, matchesRules } from '@/lib/ocr';
import type { SheetEntry, SheetEntryStatus } from '@/lib/scanner-types';
import { supabase } from '@/lib/supabase';

const STATUS_META: Record<SheetEntryStatus, { label: string; cls: string }> = {
  ready: { label: 'Ready to Import', cls: 'bg-emerald-100 text-emerald-700' },
  duplicate_in_image: { label: 'Duplicate in Image', cls: 'bg-amber-100 text-amber-700' },
  already_registered: { label: 'Already Registered', cls: 'bg-slate-200 text-slate-600' },
  needs_review: { label: 'Needs Review', cls: 'bg-orange-100 text-orange-700' },
  invalid: { label: 'Invalid Format', cls: 'bg-red-100 text-red-700' },
};

type Stage = 'choose' | 'processing' | 'review';

export function BulkScanModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (serials: string[]) => void;
}) {
  const [stage, setStage] = useState<Stage>('choose');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [entries, setEntries] = useState<SheetEntry[]>([]);
  const [zoomEntry, setZoomEntry] = useState<SheetEntry | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setStage('choose');
      setError(null);
      setImageUrl(null);
      setEntries([]);
      setProgress(0);
    }
  }, [open]);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Image too large. Please use an image under 15 MB.');
      return;
    }
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setStage('processing');
    setProgress(5);
    try {
      const rules = await loadSerialRules();
      setProgress(20);
      const sheet = await runSheetOCR(file, rules, (p) => setProgress(20 + Math.round(p * 0.7)));
      setProgress(95);

      // Authoritative DB check: which serials already exist?
      const unique = [...new Set(sheet.entries.map((e) => e.value))];
      let existing = new Set<string>();
      if (unique.length > 0) {
        const { data } = await supabase.from('terminals').select('serial_number').in('serial_number', unique);
        existing = new Set((data ?? []).map((r) => r.serial_number));
      }

      const enriched = sheet.entries.map((e) => {
        if (existing.has(e.value)) return { ...e, status: 'already_registered' as SheetEntryStatus };
        if (e.status === 'duplicate_in_image') return e;
        if (!matchesRules(e.value, rules) || ambiguousPositions(e.value).length > 3) {
          return { ...e, status: 'needs_review' as SheetEntryStatus };
        }
        return e;
      });
      setEntries(enriched);
      setStage('review');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError('Could not read the image. If it is blurry or dark, retake the photo in better light. You can also enter serials manually.');
      setStage('choose');
    }
  };

  const counts = {
    total: entries.length,
    ready: entries.filter((e) => e.status === 'ready' || e.status === 'needs_review').length,
    dupes: entries.filter((e) => e.status === 'duplicate_in_image').length,
    registered: entries.filter((e) => e.status === 'already_registered').length,
  };

  const confirm = () => {
    // Only import entries that are ready or reviewed-valid; dedupe preserving order
    const seen = new Set<string>();
    const serials: string[] = [];
    for (const e of entries) {
      const v = e.value.trim().toUpperCase();
      if (!v) continue;
      if (e.status === 'already_registered' || e.status === 'invalid') continue;
      if (seen.has(v)) continue;
      seen.add(v);
      serials.push(v);
    }
    onConfirm(serials);
  };

  const copyAll = () => {
    const text = entries.filter((e) => e.status !== 'already_registered' && e.status !== 'invalid').map((e) => e.value).join('\n');
    navigator.clipboard?.writeText(text);
  };

  const updateEntry = (idx: number, value: string) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, value: value.toUpperCase(), status: 'ready', ambiguousPositions: ambiguousPositions(value.toUpperCase()) } : e)));
  };

  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  const addManual = () => {
    setEntries((prev) => [...prev, { raw: '', value: '', status: 'ready', ambiguousPositions: [], lowConfidence: false, lineNumber: prev.length + 1 }]);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Scan Serial Numbers" size="lg">
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {stage === 'choose' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Photograph a sheet of serial numbers, or upload an existing image. Works best with good, even lighting and the sheet filling the frame.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button onClick={() => cameraInput.current?.click()} className="w-full justify-start">
              <Camera className="h-4 w-4" /> Take Photo
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} className="w-full justify-start">
              <Upload className="h-4 w-4" /> Upload Image
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} className="w-full justify-start">
              <FileUp className="h-4 w-4" /> Choose File
            </Button>
          </div>
          {error && <ErrorBanner message={error} />}
        </div>
      )}

      {stage === 'processing' && (
        <div className="flex flex-col items-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
          <p className="mt-4 text-sm font-medium text-slate-700">Reading serial numbers…</p>
          <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-purple-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Large sheets can take up to a minute on first use.</p>
        </div>
      )}

      {stage === 'review' && imageUrl && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <SummaryBox label="Detected" value={counts.total} />
            <SummaryBox label="Ready" value={counts.ready} color="text-emerald-700" />
            <SummaryBox label="Dup. in image" value={counts.dupes} color="text-amber-700" />
            <SummaryBox label="Registered" value={counts.registered} color="text-slate-600" />
          </div>

          {/* Image preview */}
          <div className="relative overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl} alt="Scanned sheet" className="max-h-56 w-full object-contain bg-slate-50" />
          </div>

          {/* Entries */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">Extracted Serial Numbers</h4>
              <button onClick={addManual} className="flex items-center gap-1 text-xs font-medium text-purple-600">
                <Plus className="h-3.5 w-3.5" /> Add manually
              </button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {entries.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">No serial numbers detected. Try retaking the photo, or add entries manually.</p>
              )}
              {entries.map((e, idx) => {
                const meta = STATUS_META[e.status];
                const isAmbiguous = e.ambiguousPositions.length > 0 && e.status !== 'already_registered';
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
                    <input
                      value={e.value}
                      onChange={(ev) => updateEntry(idx, ev.target.value)}
                      className={`min-w-0 flex-1 rounded border px-2 py-1.5 font-mono text-sm ${
                        e.status === 'invalid' || e.status === 'needs_review' ? 'border-orange-300 bg-orange-50' : 'border-slate-200'
                      }`}
                    />
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline ${meta.cls}`}>
                      {meta.label}
                    </span>
                    {isAmbiguous && (
                      <button onClick={() => setZoomEntry(e)} title="Ambiguous characters — compare with image" className="text-orange-500">
                        <AlertTriangle className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => setZoomEntry(e)} title="View image" className="text-slate-400 hover:text-slate-600">
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeEntry(idx)} title="Remove" className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            {(entries.some((e) => e.status === 'needs_review') || entries.some((e) => e.lowConfidence)) && (
              <p className="mt-2 flex items-start gap-1 text-xs text-orange-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Some entries were unclear (blur, glare, or visually similar characters like O/0, I/1). They are marked "Needs Review" — please compare each against the image and correct before importing.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={counts.ready === 0} className="flex-1">
              <CheckCircle2 className="h-4 w-4" /> Confirm & Import ({counts.ready})
            </Button>
            <Button variant="outline" onClick={() => cameraInput.current?.click()}>
              <RotateCcw className="h-4 w-4" /> Retake
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> Another image
            </Button>
            <Button variant="ghost" onClick={copyAll}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      )}

      {/* Zoom / inspect modal */}
      {zoomEntry && imageUrl && (
        <ZoomModal entry={zoomEntry} imageUrl={imageUrl} onClose={() => setZoomEntry(null)} />
      )}
    </Modal>
  );
}

function SummaryBox({ label, value, color = 'text-slate-800' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function ZoomModal({ entry, imageUrl, onClose }: { entry: SheetEntry; imageUrl: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4">
      <div className="mb-3 flex items-center justify-between text-white">
        <p className="font-mono text-sm">{entry.raw}</p>
        <div className="flex gap-2">
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="rounded bg-white/10 px-3 py-1 text-sm">+</button>
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="rounded bg-white/10 px-3 py-1 text-sm">−</button>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm">Close</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <img src={imageUrl} alt="Sheet" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="max-w-none" />
      </div>
      {entry.ambiguousPositions.length > 0 && (
        <p className="mt-3 text-center text-xs text-amber-300">
          Watch for look-alike characters: {entry.ambiguousPositions.map((i) => entry.raw[i]).join(', ')} could be 0/O, 1/I, 5/S, 8/B or 2/Z.
        </p>
      )}
    </div>
  );
}

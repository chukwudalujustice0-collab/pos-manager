import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { SingleScanModal } from '@/screens/SingleScanModal';

/** Small button placed beside serial-number inputs. Fills the input via onScan. */
export function ScanButton({ onScan }: { onScan: (serial: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Scan serial number with camera"
        className="flex h-[38px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
      >
        <ScanLine className="h-4 w-4" /> Scan
      </button>
      {open && <SingleScanModal open={open} onClose={() => setOpen(false)} onResult={onScan} />}
    </>
  );
}

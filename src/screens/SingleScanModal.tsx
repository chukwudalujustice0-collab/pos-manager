import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Loader2, RotateCcw, CheckCircle2, ScanLine, X, Video, Image as ImageIcon } from 'lucide-react';
import { Modal, Button, Input, ErrorBanner } from '@/components/ui';
import { runSingleLabelOCR, runFrameOCR, loadSerialRules, matchesRules, ambiguousPositions } from '@/lib/ocr';
import type { SerialRules } from '@/lib/scanner-types';

type Mode = 'choose' | 'photo' | 'live' | 'result';

const STABLE_FRAMES_REQUIRED = 3;

/**
 * Single serial scanner. Opens camera (photo or live mode) or file upload,
 * runs OCR, and fills a controlled input via onResult.
 */
export function SingleScanModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (serial: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const stableRef = useRef<{ serial: string | null; count: number }>({ serial: null, count: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setMode('choose');
      setError(null);
      setResult('');
      setRawText('');
      setCandidates([]);
      setPermissionDenied(false);
    }
  }, [open, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  const requestStream = async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      return stream;
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setPermissionDenied(true);
      } else {
        setError('Could not open the camera. Use "Take Photo" or upload an image instead.');
      }
      return null;
    }
  };

  // -------- Live scan loop --------
  const startLive = async () => {
    setError(null);
    const stream = await requestStream();
    if (!stream) return;
    setMode('live');
    // Wait for video element
    requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.play().catch(() => {});
    });
    stableRef.current = { serial: null, count: 0 };
    const rules = await loadSerialRules();

    const loop = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || processingRef.current) {
        rafRef.current = requestAnimationFrame(() => void loop());
        return;
      }
      processingRef.current = true;
      try {
        // Downscale frame for speed
        const w = 640;
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(video, 0, 0, w, h);
        const serial = await runFrameOCR(c, rules);
        if (serial) {
          if (stableRef.current.serial === serial) {
            stableRef.current.count++;
          } else {
            stableRef.current = { serial, count: 1 };
          }
          // Stable across consecutive frames → show result
          if (stableRef.current.count >= STABLE_FRAMES_REQUIRED) {
            stopCamera();
            setMode('result');
            setResult(serial);
            processingRef.current = false;
            return;
          }
        }
      } catch {
        // frame failed; keep looping
      }
      processingRef.current = false;
      // Throttle to ~4 fps of OCR work
      setTimeout(() => {
        rafRef.current = requestAnimationFrame(() => void loop());
      }, 250);
    };
    rafRef.current = requestAnimationFrame(() => void loop());
  };

  // -------- Single photo --------
  const handleImage = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    setBusy(true);
    setMode('photo');
    try {
      const rules: SerialRules = await loadSerialRules();
      const res = await runSingleLabelOCR(file, rules);
      setRawText(res.rawText);
      setCandidates(res.all);
      if (res.best) {
        setResult(res.best);
        setMode('result');
      } else {
        setError('No serial number detected. Try a closer, well-lit photo or enter it manually.');
        setMode('choose');
      }
    } catch (err) {
      console.error(err);
      setError('Could not read the image. Try retaking it with better lighting.');
      setMode('choose');
    }
    setBusy(false);
  };

  const isRuleMatch = result ? matchesRules(result.toUpperCase(), { ...defaultRulesRef.current }) : false;
  const ambiguous = result ? ambiguousPositions(result.toUpperCase()) : [];

  const confirm = () => {
    const v = result.trim().toUpperCase();
    if (!v) return;
    onResult(v);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => { stopCamera(); onClose(); }} title="Scan Serial Number">
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />
      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />

      {mode === 'choose' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Photograph the serial-number label on the back of the POS terminal.</p>
          <div className="grid grid-cols-1 gap-2">
            <Button onClick={startLive} className="justify-start">
              <Video className="h-4 w-4" /> Live Scan
            </Button>
            <Button variant="outline" onClick={() => cameraInput.current?.click()} className="justify-start">
              <Camera className="h-4 w-4" /> Take Photo
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} className="justify-start">
              <ImageIcon className="h-4 w-4" /> Upload Image
            </Button>
          </div>
          {busy && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading label…
            </div>
          )}
          {error && <ErrorBanner message={error} />}
          {permissionDenied && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Camera access was denied. To enable it, tap the padlock icon in your browser's address bar, allow Camera, and reload. You can still use "Take Photo" or upload an image.
            </div>
          )}
        </div>
      )}

      {mode === 'live' && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="w-full" playsInline muted />
            {/* Scanning frame overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-28 w-4/5 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/90">
              Position the POS serial-number label inside the frame.
            </p>
            {stableRef.current.serial && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-white">
                {stableRef.current.serial} ({stableRef.current.count}/{STABLE_FRAMES_REQUIRED})
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => cameraInput.current?.click()}>
              <Camera className="h-4 w-4" /> Capture manually
            </Button>
            <Button variant="ghost" onClick={() => { stopCamera(); setMode('choose'); }}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
          {permissionDenied && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Camera access was denied. Allow camera access in your browser settings and reload.
            </div>
          )}
        </div>
      )}

      {mode === 'photo' && busy && (
        <div className="flex flex-col items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="mt-3 text-sm text-slate-500">Reading label…</p>
        </div>
      )}

      {mode === 'result' && (
        <div className="space-y-4">
          <div>
            <Input label="Detected Serial Number" value={result} onChange={setResult} />
            {!isRuleMatch && result && (
              <p className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                <ScanLine className="h-3.5 w-3.5" /> This doesn't match your configured serial format — please check it against the label.
              </p>
            )}
            {ambiguous.length > 0 && isRuleMatch && (
              <p className="mt-1 text-xs text-amber-600">
                Look-alike characters detected ({ambiguous.map((i) => result[i]).join(', ')}). Verify 0/O, 1/I, 5/S, 8/B, 2/Z against the label.
              </p>
            )}
          </div>
          {rawText && (
            <details className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              <summary className="cursor-pointer">Show original OCR text</summary>
              <pre className="mt-1 whitespace-pre-wrap">{rawText}</pre>
              {candidates.length > 1 && (
                <div className="mt-2">
                  <p className="font-medium">Other candidates found:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {candidates.filter((c) => c !== result.toUpperCase()).map((c) => (
                      <button key={c} onClick={() => setResult(c)} className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-purple-700 ring-1 ring-slate-200">
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </details>
          )}
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={!result.trim()} className="flex-1">
              <CheckCircle2 className="h-4 w-4" /> Use This Serial
            </Button>
            <Button variant="outline" onClick={() => { setMode('choose'); setResult(''); }}>
              <RotateCcw className="h-4 w-4" /> Rescan
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Lazily-populated fallback rules used only for immediate client-side hint display
const defaultRulesRef: { current: import('@/lib/scanner-types').SerialRules } = {
  current: { prefix: 'WEMA', min_length: 6, max_length: 20, charset: 'alphanumeric' },
};

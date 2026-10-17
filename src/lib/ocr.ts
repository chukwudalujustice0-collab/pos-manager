import type { ParsedSheet, SheetEntry, SerialRules } from '@/lib/scanner-types';

export const DEFAULT_RULES: SerialRules = {
  prefix: 'WEMA',
  min_length: 6,
  max_length: 20,
  charset: 'alphanumeric',
};

const AMBIGUOUS: Record<string, string[]> = {
  O: ['0'],
  '0': ['O'],
  I: ['1'],
  '1': ['I'],
  S: ['5'],
  '5': ['S'],
  B: ['8'],
  '8': ['B'],
  Z: ['2'],
  '2': ['Z'],
};

/** Loads serial rules from app_settings (key 'serial_rules'), falling back to defaults. */
export async function loadSerialRules(): Promise<SerialRules> {
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'serial_rules').maybeSingle();
  if (data?.value && typeof data.value === 'object') {
    const v = data.value as Partial<SerialRules>;
    return { ...DEFAULT_RULES, ...v };
  }
  return DEFAULT_RULES;
}

/** A serial matches if: optional prefix, then required min-length body of allowed chars. */
export function matchesRules(serial: string, rules: SerialRules): boolean {
  const s = serial.toUpperCase();
  let body = s;
  if (rules.prefix) {
    if (!s.startsWith(rules.prefix.toUpperCase())) return false;
    body = s.slice(rules.prefix.length);
  }
  if (body.length < rules.min_length || body.length > rules.max_length) return false;
  switch (rules.charset) {
    case 'digits': return /^\d+$/.test(body);
    case 'letters': return /^[A-Z]+$/.test(body);
    default: return /^[A-Z0-9\-_]+$/.test(body);
  }
}

/** Flags positions where a visually-similar character could change the value. */
export function ambiguousPositions(serial: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < serial.length; i++) {
    if (AMBIGUOUS[serial[i]]) positions.push(i);
  }
  return positions;
}

export function normalizeLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Extracts candidate serials from a line of OCR text, filtering by rules when possible. */
export function extractCandidatesFromLine(line: string, rules: SerialRules): string[] {
  // Tokens: letter/digit runs possibly containing internal - or _
  const tokens = line.toUpperCase().split(/[^A-Z0-9\-_]+/).filter(Boolean);
  const candidates: string[] = [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/[^A-Z0-9\-_]/g, '');
    if (!cleaned) continue;
    if (matchesRules(cleaned, rules)) {
      candidates.push(cleaned);
    }
  }
  // If no rule-matching token on the line, fall back to the longest alphanumeric token
  if (candidates.length === 0 && tokens.length > 0) {
    const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (longest.length >= 4 && /\d/.test(longest)) candidates.push(longest);
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Image preprocessing: downscale, grayscale, contrast boost
// ---------------------------------------------------------------------------
export async function preprocessImage(file: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  // Downscale large photos to a max dimension while keeping small text readable
  const MAX_DIM = 2000;
  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  // Grayscale + contrast stretch
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const stretched = ((gray[p] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = stretched;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// OCR engine (Tesseract.js, loaded lazily)
// ---------------------------------------------------------------------------
type RecognizeResult = {
  data: {
    text: string;
    lines?: {
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      words?: { text: string; confidence: number }[];
    }[];
    confidence: number;
  };
};

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;

async function getWorker(): Promise<import('tesseract.js').Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then((Tesseract) =>
      Tesseract.createWorker('eng', 1, { logger: () => {} })
    );
  }
  return workerPromise;
}

/** Runs OCR and reconstructs a multi-column sheet into reading order. */
export async function runSheetOCR(
  file: File | Blob,
  rules: SerialRules,
  onProgress?: (pct: number) => void
): Promise<ParsedSheet> {
  const canvas = await preprocessImage(file);
  const worker = await getWorker();
  const { data } = (await worker.recognize(canvas, {}, { blocks: true })) as unknown as RecognizeResult;

  const rawLines = (data.lines ?? []).map((l) => ({
    text: normalizeLine(l.text),
    bbox: l.bbox,
    avgConfidence: l.words?.length
      ? l.words.reduce((s, w) => s + w.confidence, 0) / l.words.length
      : data.confidence,
  })).filter((l) => l.text.length > 0);

  // Column clustering: split lines into column buckets by x-position when
  // there is a clear vertical gutter between two clusters of line x-ranges.
  const sortedByX = [...rawLines].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  let gutterX: number | null = null;
  if (sortedByX.length >= 4) {
    // Find the biggest horizontal gap between line end and next line start
    let maxGap = 0;
    for (let i = 1; i < sortedByX.length; i++) {
      const gap = sortedByX[i].bbox.x0 - sortedByX[i - 1].bbox.x1;
      if (gap > maxGap) {
        maxGap = gap;
        gutterX = (sortedByX[i].bbox.x0 + sortedByX[i - 1].bbox.x1) / 2;
      }
    }
    // Require the gutter to be meaningful relative to page width
    if (maxGap < canvas.width * 0.08) gutterX = null;
  }

  const inColumns: { text: string; y: number }[][] = [[], []];
  for (const l of rawLines) {
    const isLeft = gutterX == null || l.bbox.x1 <= gutterX;
    inColumns[isLeft ? 0 : 1].push({ text: l.text, y: l.bbox.y0 });
  }
  for (const col of inColumns) col.sort((a, b) => a.y - b.y);

  const orderedLines = [...inColumns[0], ...inColumns[1]].map((l) => l.text);

  return buildSheet(orderedLines, rawLines, rules, gutterX != null ? 2 : 1);
}

function buildSheet(
  orderedLines: string[],
  rawLines: { text: string; avgConfidence: number }[],
  rules: SerialRules,
  columnCount: number
): ParsedSheet {
  const entries: SheetEntry[] = [];
  const seen = new Map<string, number>();

  for (const line of orderedLines) {
    for (const cand of extractCandidatesFromLine(line, rules)) {
      const dupCount = (seen.get(cand) ?? 0) + 1;
      seen.set(cand, dupCount);
      entries.push({
        raw: cand,
        value: cand,
        status: 'ready',
        ambiguousPositions: ambiguousPositions(cand),
        lowConfidence: false,
        lineNumber: entries.length + 1,
      });
    }
  }

  // Flag low-confidence lines: any entry sourced from a line whose avg word
  // confidence fell below 70 — approximated by re-checking raw line text.
  const lowLines = new Set(rawLines.filter((l) => l.avgConfidence < 70).map((l) => l.text));
  if (lowLines.size > 0) {
    for (const e of entries) {
      const fromLow = orderedLines.some((l) => lowLines.has(l) && l.includes(e.raw));
      if (fromLow) {
        e.lowConfidence = true;
        e.status = 'needs_review';
      }
    }
  }

  // Mark in-image duplicates
  for (const [serial, count] of seen) {
    if (count > 1) {
      entries.filter((e) => e.raw === serial).forEach((e) => {
        e.status = 'duplicate_in_image';
      });
    }
  }

  return {
    entries,
    imagePreviewUrl: null,
    columnCount,
    rawText: orderedLines.join('\n'),
  };
}

/** Single-label OCR: picks the best rule-matching candidate from one label photo. */
export async function runSingleLabelOCR(
  file: File | Blob,
  rules: SerialRules
): Promise<{ best: string | null; all: string[]; rawText: string }> {
  const canvas = await preprocessImage(file);
  const worker = await getWorker();
  const { data } = (await worker.recognize(canvas, {}, { blocks: true })) as unknown as RecognizeResult;
  const text = normalizeLine(data.text ?? '');
  const candidates = extractCandidatesFromLine(text, rules);
  // Prefer exact rule matches with the longest body
  const ruleMatches = candidates.filter((c) => matchesRules(c, rules));
  const best = ruleMatches.sort((a, b) => b.length - a.length)[0] ?? candidates[0] ?? null;
  return { best, all: candidates, rawText: text };
}

/** Live frame OCR — reused worker, no preprocessing-heavy pipeline per frame. */
export async function runFrameOCR(canvas: HTMLCanvasElement, rules: SerialRules): Promise<string | null> {
  const worker = await getWorker();
  const { data } = (await worker.recognize(canvas)) as unknown as RecognizeResult;
  const text = normalizeLine(data.text ?? '');
  const candidates = extractCandidatesFromLine(text, rules).filter((c) => matchesRules(c, rules));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

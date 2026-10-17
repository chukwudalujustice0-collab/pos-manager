export interface SerialRules {
  prefix: string;
  min_length: number;
  max_length: number;
  charset: 'alphanumeric' | 'digits' | 'letters';
}

export type SheetEntryStatus =
  | 'ready'                // Ready to Import
  | 'duplicate_in_image'   // Duplicate in Image
  | 'already_registered'   // Already Registered (in DB)
  | 'needs_review'         // Needs Review (low OCR confidence / ambiguous)
  | 'invalid';             // Invalid Format

export interface SheetEntry {
  raw: string;               // original OCR text (uppercased)
  value: string;             // possibly edited by user
  status: SheetEntryStatus;
  ambiguousPositions: number[];
  lowConfidence: boolean;
  lineNumber: number;
}

export interface ParsedSheet {
  entries: SheetEntry[];
  imagePreviewUrl: string | null;
  columnCount: number;
  rawText: string;
}

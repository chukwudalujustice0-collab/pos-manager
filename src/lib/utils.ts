import type { TerminalStatus, TransferStatus, MappingStatus } from '@/lib/supabase';

export const STATUS_LABELS: Record<TerminalStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  in_transit: 'In Transit',
  sold: 'Sold',
  returned: 'Returned',
  damaged: 'Damaged',
  missing: 'Missing',
};

export const STATUS_COLORS: Record<TerminalStatus, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  assigned: 'bg-purple-100 text-purple-700 border-purple-200',
  in_transit: 'bg-amber-100 text-amber-700 border-amber-200',
  sold: 'bg-violet-100 text-violet-700 border-violet-200',
  returned: 'bg-slate-100 text-slate-700 border-slate-200',
  damaged: 'bg-red-100 text-red-700 border-red-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
};

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Draft',
  dispatched: 'Dispatched',
  in_transit: 'In Transit',
  received: 'Received',
  partial: 'Partial',
  exception: 'Exception',
};

export const TRANSFER_STATUS_COLORS: Record<TransferStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  dispatched: 'bg-purple-100 text-purple-700 border-purple-200',
  in_transit: 'bg-amber-100 text-amber-700 border-amber-200',
  received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  partial: 'bg-orange-100 text-orange-700 border-orange-200',
  exception: 'bg-red-100 text-red-700 border-red-200',
};

export const MAPPING_LABELS: Record<MappingStatus, string> = {
  mapped: 'Mapped',
  pending_details: 'Pending Details',
};

export const MAPPING_COLORS: Record<MappingStatus, string> = {
  mapped: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending_details: 'bg-amber-100 text-amber-700 border-amber-200',
};

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateCode(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

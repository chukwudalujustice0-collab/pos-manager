import { supabase } from '@/lib/supabase';
import type { SaleFinance, Expense, CommissionPayment, FinanceSettings } from '@/lib/supabase';

export const BUSINESS_TZ = 'Africa/Lagos';

export interface PeriodTotals {
  terminals_sold: number;
  commission_earned: number;
  commission_received: number;
  commission_pending: number;
  delivery_expenses: number;
  other_expenses: number;
  gross_margin: number;
  net_profit: number;
  unpaid_delivery: number;
  operating_expenses: number;
  net_operating_result: number;
}

export interface FinanceBundle {
  finances: SaleFinance[];
  expenses: Expense[];
  payments: CommissionPayment[];
}

export async function loadFinanceBundle(): Promise<FinanceBundle> {
  const [fin, exp, pay] = await Promise.all([
    supabase.from('sale_finances').select('*, agent:agents(*)').order('sale_date', { ascending: false }),
    supabase.from('expenses').select('*, agent:agents(*)').order('date_incurred', { ascending: false }),
    supabase.from('commission_payments').select('*').order('payment_date', { ascending: false }),
  ]);
  return {
    finances: (fin.data ?? []) as SaleFinance[],
    expenses: (exp.data ?? []) as Expense[],
    payments: (pay.data ?? []) as CommissionPayment[],
  };
}

export async function loadFinanceSettings(): Promise<FinanceSettings | null> {
  const { data } = await supabase.from('finance_settings').select('*').eq('id', 1).maybeSingle();
  return (data as FinanceSettings) ?? null;
}

// ---------------------------------------------------------
// Date periods in Africa/Lagos
// ---------------------------------------------------------

/** YYYY-MM-DD of "now" in the business timezone. */
export function todayInLagos(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PeriodKey =
  | 'today' | 'yesterday' | 'last7' | 'last14' | 'this_week' | 'prev_week'
  | 'this_month' | 'prev_month' | 'this_year' | 'prev_year' | 'all' | 'custom';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'this_week', label: 'This week' },
  { value: 'prev_week', label: 'Previous week' },
  { value: 'this_month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'this_year', label: 'This year' },
  { value: 'prev_year', label: 'Previous year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

/** Returns [startISO, endISO] inclusive, in business timezone. */
export function periodRange(period: PeriodKey, customStart?: string, customEnd?: string): [string, string | null] {
  const today = todayInLagos();
  switch (period) {
    case 'today': return [today, today];
    case 'yesterday': { const y = shiftDays(today, -1); return [y, y]; }
    case 'last7': return [shiftDays(today, -6), today];
    case 'last14': return [shiftDays(today, -13), today];
    case 'this_week': {
      const d = new Date(today + 'T12:00:00Z');
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      return [shiftDays(today, -dow), today];
    }
    case 'prev_week': {
      const d = new Date(today + 'T12:00:00Z');
      const dow = (d.getUTCDay() + 6) % 7;
      const thisMonday = shiftDays(today, -dow);
      const prevMonday = shiftDays(thisMonday, -7);
      return [prevMonday, shiftDays(thisMonday, -1)];
    }
    case 'this_month': return [today.slice(0, 8) + '01', today];
    case 'prev_month': {
      const first = today.slice(0, 8) + '01';
      const prevLast = shiftDays(first, -1);
      return [prevLast.slice(0, 8) + '01', prevLast];
    }
    case 'this_year': return [today.slice(0, 4) + '-01-01', today];
    case 'prev_year': {
      const y = parseInt(today.slice(0, 4)) - 1;
      return [`${y}-01-01`, `${y}-12-31`];
    }
    case 'custom': return [customStart ?? today, customEnd ?? customStart ?? today];
    case 'all':
    default: return ['1970-01-01', null];
  }
}

/** Filters finances/expenses to a period. Dates are YYYY-MM-DD strings, so no TZ drift. */
export function inPeriod(dateISO: string | null | undefined, start: string, end: string | null): boolean {
  if (!dateISO) return false;
  const d = dateISO.slice(0, 10);
  if (d < start) return false;
  if (end && d > end) return false;
  return true;
}

export function computeTotals(bundle: FinanceBundle, start: string, end: string | null): PeriodTotals {
  const fin = bundle.finances.filter((f) => inPeriod(f.sale_date, start, end));
  const exp = bundle.expenses.filter((e) => inPeriod(e.date_incurred, start, end));

  const commissionEarned = fin.reduce((s, f) => s + Number(f.commission_earned), 0);
  const commissionPaid = fin.reduce((s, f) => s + Number(f.commission_paid_amount), 0);
  const delivery = fin.reduce((s, f) => s + Number(f.delivery_amount), 0);
  const other = fin.reduce((s, f) => s + Number(f.other_expense), 0);
  const unpaidDelivery = fin
    .filter((f) => f.delivery_status !== 'paid')
    .reduce((s, f) => s + Number(f.delivery_amount), 0);
  const operating = exp.reduce((s, e) => s + Number(e.amount), 0);

  return {
    terminals_sold: fin.length,
    commission_earned: commissionEarned,
    commission_received: commissionPaid,
    commission_pending: commissionEarned - commissionPaid,
    delivery_expenses: delivery,
    other_expenses: other,
    gross_margin: commissionEarned,
    net_profit: commissionEarned - delivery - other,
    unpaid_delivery: unpaidDelivery,
    operating_expenses: operating,
    net_operating_result: commissionEarned - delivery - other - operating,
  };
}

/** Daily breakdown rows for a period. */
export function dailyBreakdown(bundle: FinanceBundle, start: string, end: string | null): { date: string; totals: PeriodTotals }[] {
  const out: { date: string; totals: PeriodTotals }[] = [];
  if (!end) return out;
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    out.push({ date: cursor, totals: computeTotals(bundle, cursor, cursor) });
    cursor = shiftDays(cursor, 1);
    guard++;
  }
  return out;
}

/** Per-agent profitability from finance rows. */
export function agentProfitability(bundle: FinanceBundle, start: string, end: string | null) {
  const map = new Map<string | null, {
    agent_id: string | null; name: string; terminals: number; commission: number;
    delivery: number; other: number; net: number; pending_commission: number; unpaid_delivery: number;
  }>();
  for (const f of bundle.finances) {
    if (!inPeriod(f.sale_date, start, end)) continue;
    const key = f.agent_id;
    if (!map.has(key)) {
      map.set(key, {
        agent_id: key, name: f.agent?.full_name ?? 'Direct sale', terminals: 0, commission: 0,
        delivery: 0, other: 0, net: 0, pending_commission: 0, unpaid_delivery: 0,
      });
    }
    const row = map.get(key)!;
    row.terminals++;
    row.commission += Number(f.commission_earned);
    row.delivery += Number(f.delivery_amount);
    row.other += Number(f.other_expense);
    row.net += Number(f.net_profit);
    if (f.commission_status === 'pending') row.pending_commission += Number(f.commission_earned) - Number(f.commission_paid_amount);
    if (f.delivery_status !== 'paid') row.unpaid_delivery += Number(f.delivery_amount);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

// ---------------------------------------------------------
// Sale-time finance write (idempotent wrapper)
// ---------------------------------------------------------
export interface FinancePrefs {
  deliveryAmount: number;
  deliveryRecipient: string;
  otherExpense: number;
  deliveryNote: string;
}

/** Records the per-sale finance row via atomic RPC; retries never duplicate. */
export async function recordSaleFinanceSafe(saleId: string, prefs: FinancePrefs): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('record_sale_finance', {
    p_sale_id: saleId,
    p_delivery_amount: prefs.deliveryAmount || 0,
    p_delivery_recipient: prefs.deliveryRecipient || null,
    p_other_expense: prefs.otherExpense || 0,
  });
  if (error) return { ok: false, error: error.message };
  const financeId = data as string;
  if (prefs.deliveryNote && financeId) {
    await supabase.from('sale_finances').update({ delivery_note: prefs.deliveryNote }).eq('id', financeId);
  }
  return { ok: true };
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.SUPABASE_PUBLISHABLE_KEY as string | undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase configuration is missing.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'owner' | 'inventory_manager' | 'sales_officer' | 'field_agent';

export type TerminalStatus =
  | 'available'
  | 'assigned'
  | 'in_transit'
  | 'sold'
  | 'returned'
  | 'damaged'
  | 'missing';

export type TransferStatus = 'draft' | 'dispatched' | 'in_transit' | 'received' | 'partial' | 'exception';
export type MappingStatus = 'mapped' | 'pending_details';
export type ApprovalStatus = 'confirmed' | 'pending_approval' | 'rejected';
export type ReturnCondition = 'working' | 'damaged' | 'awaiting_inspection';
export type MovementType =
  | 'receipt'
  | 'dispatch'
  | 'transfer_receive'
  | 'sale'
  | 'return'
  | 'damage'
  | 'missing'
  | 'correction'
  | 'reassign';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  agent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  can_review_kyc?: boolean;
}

export interface Invitation {
  id: string;
  pass_key: string;
  phone: string;
  role: UserRole;
  created_by: string | null;
  expires_at: string | null;
  status: 'active' | 'redeemed' | 'expired' | 'revoked';
  redeemed_by: string | null;
  redeemed_at: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  address: string | null;
  state: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  id: string;
  agent_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  city: string | null;
  town: string | null;
  area: string | null;
  address: string | null;
  notes: string | null;
  id_document_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReceiptBatch {
  id: string;
  batch_code: string;
  supplier: string;
  delivery_ref: string | null;
  date_received: string;
  qty_expected: number;
  qty_received: number;
  location_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  location?: Location | null;
}

export interface Terminal {
  id: string;
  serial_number: string;
  model: string | null;
  receipt_batch_id: string | null;
  supplier: string | null;
  date_received: string | null;
  status: TerminalStatus;
  location_id: string | null;
  agent_id: string | null;
  customer_id: string | null;
  sale_id: string | null;
  date_assigned: string | null;
  date_sold: string | null;
  mapping_status: MappingStatus | null;
  exception_flag: boolean;
  notes: string | null;
  voided: boolean;
  return_id: string | null;
  created_at: string;
  updated_at: string;
  agent?: Agent | null;
  location?: Location | null;
  receipt_batch?: ReceiptBatch | null;
  active_return?: TerminalReturn | null;
}

export interface Transfer {
  id: string;
  transfer_code: string;
  source_type: string;
  source_location_id: string | null;
  source_agent_id: string | null;
  dest_type: string;
  dest_location_id: string | null;
  dest_agent_id: string | null;
  qty_total: number;
  qty_received: number;
  status: TransferStatus;
  dispatch_date: string | null;
  received_date: string | null;
  waybill_ref: string | null;
  transferred_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  source_location?: Location | null;
  source_agent?: Agent | null;
  dest_location?: Location | null;
  dest_agent?: Agent | null;
  items?: TransferItem[];
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  terminal_id: string;
  received: boolean;
  disputed: boolean;
  dispute_note: string | null;
  created_at: string;
  terminal?: Terminal;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  business_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  sale_code: string;
  terminal_id: string;
  customer_id: string | null;
  agent_id: string | null;
  sale_date: string;
  sale_ref: string | null;
  channel: string | null;
  sale_price: number | null;
  mapping_status: MappingStatus;
  approval_status: ApprovalStatus;
  recorded_by: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  notes: string | null;
  created_at: string;
  terminal?: Terminal;
  customer?: Customer | null;
  agent?: Agent | null;
}

export interface InventoryMovement {
  id: string;
  terminal_id: string;
  movement_type: MovementType;
  from_location_id: string | null;
  to_location_id: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  transfer_id: string | null;
  sale_id: string | null;
  receipt_batch_id: string | null;
  performed_by: string | null;
  reference: string | null;
  reason: string | null;
  created_at: string;
  terminal?: Terminal;
  from_location?: Location | null;
  to_location?: Location | null;
  from_agent?: Agent | null;
  to_agent?: Agent | null;
}

export interface AppNotification {
  id: string;
  user_id: string | null;
  category: string;
  title: string;
  body: string | null;
  related_ref: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface TerminalReturn {
  id: string;
  terminal_id: string;
  sale_id: string | null;
  returned_by: string | null;
  return_date: string;
  reason: string;
  condition: ReturnCondition;
  confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejected: boolean;
  rejection_note: string | null;
  notes: string | null;
  created_at: string;
  terminal?: Terminal;
  sale?: Sale | null;
}

// ===================== Finance module types =====================

export type CommissionStatus = 'pending' | 'received' | 'disputed';
export type PayStatus = 'unpaid' | 'pending' | 'paid';

export interface FinanceSettings {
  id: number;
  selling_price: number;
  commission_per_terminal: number;
  currency: string;
  recognition_rule: 'on_sale_confirmed' | 'on_eligibility' | 'on_payment';
  delivery_rate_per_agent: Record<string, number>;
  effective_from: string;
  updated_by: string | null;
  updated_at: string;
}

export interface SaleFinance {
  id: string;
  sale_id: string;
  terminal_id: string | null;
  serial_number: string | null;
  agent_id: string | null;
  sale_date: string;
  selling_price: number | null;
  commission_rate: number;
  commission_earned: number;
  commission_status: CommissionStatus;
  commission_paid_amount: number;
  delivery_amount: number;
  delivery_recipient: string | null;
  delivery_status: PayStatus;
  delivery_paid_date: string | null;
  delivery_payment_ref: string | null;
  delivery_note: string | null;
  other_expense: number;
  gross_margin: number;
  net_profit: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  agent?: Agent | null;
  sale?: Sale | null;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  date_incurred: string;
  status: PayStatus;
  payment_ref: string | null;
  sale_id: string | null;
  terminal_id: string | null;
  agent_id: string | null;
  receipt_batch_id: string | null;
  location_id: string | null;
  attachment_url: string | null;
  recorded_by: string | null;
  created_at: string;
  agent?: Agent | null;
}

export interface CommissionPayment {
  id: string;
  payment_reference: string;
  amount: number;
  payment_date: string;
  payer: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface FinanceRate {
  id: string;
  selling_price: number;
  commission_per_terminal: number;
  agent_id: string | null;
  effective_from: string;
  created_at: string;
}

// ===================== Banner module types =====================

export interface BannerType {
  id: string;
  name: string;
  sku: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BannerReceipt {
  id: string;
  receipt_code: string;
  supplier: string;
  delivery_ref: string | null;
  date_received: string;
  location_id: string | null;
  notes: string | null;
  created_at: string;
  location?: Location | null;
}

export interface BannerReceiptItem {
  id: string;
  receipt_id: string;
  banner_type_id: string;
  qty_expected: number;
  qty_received: number;
  notes: string | null;
  banner_type?: BannerType;
}

export interface BannerTransfer {
  id: string;
  transfer_code: string;
  banner_type_id: string;
  source_location_id: string | null;
  dest_agent_id: string | null;
  dest_location_id: string | null;
  qty_dispatched: number;
  qty_accepted: number;
  qty_disputed: number;
  status: 'draft' | 'dispatched' | 'in_transit' | 'received' | 'exception';
  dispatch_date: string | null;
  received_date: string | null;
  waybill_ref: string | null;
  notes: string | null;
  created_at: string;
  banner_type?: BannerType;
  dest_agent?: Agent | null;
  source_location?: Location | null;
}

export type BannerMovementType =
  | 'receipt' | 'transfer_out' | 'transfer_in' | 'issue_with_sale'
  | 'return' | 'damage' | 'missing' | 'adjustment';

export interface BannerMovement {
  id: string;
  movement_type: BannerMovementType;
  banner_type_id: string;
  quantity: number;
  agent_id: string | null;
  location_id: string | null;
  sale_id: string | null;
  terminal_id: string | null;
  transfer_id: string | null;
  receipt_id: string | null;
  reference: string | null;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
  banner_type?: BannerType;
  agent?: Agent | null;
  location?: Location | null;
}

export interface BannerBalance {
  id: string;
  banner_type_id: string;
  agent_id: string | null;
  location_id: string | null;
  quantity: number;
  updated_at: string;
  banner_type?: BannerType;
  agent?: Agent | null;
  location?: Location | null;
}

export interface BannerIssueLog {
  id: string;
  sale_id: string;
  terminal_id: string | null;
  agent_id: string | null;
  banner_type_id: string;
  quantity: number;
  issued_at: string;
  banner_type?: BannerType;
  agent?: Agent | null;
  terminal?: Terminal | null;
}

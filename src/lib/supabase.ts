import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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
  created_at: string;
  updated_at: string;
  agent?: Agent | null;
  location?: Location | null;
  receipt_batch?: ReceiptBatch | null;
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
  recorded_by: string | null;
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

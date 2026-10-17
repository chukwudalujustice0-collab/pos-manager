/*
# Wema POS Distribution Manager — Initial Schema

## Overview
Creates the complete relational schema for a POS terminal distribution, inventory,
sales, and agent stock management system. This is a single-business private tool
with role-based access (owner, inventory_manager, sales_officer, field_agent).

## Tables Created
1. profiles — links auth.users to business roles (owner/inventory_manager/sales_officer/field_agent)
2. locations — warehouses and stock locations
3. agents — field agents who receive and sell terminals
4. receipt_batches — records of stock received from supplier (e.g. Wema Bank)
5. terminals — individual POS terminal records (serial-number level inventory)
6. transfers — stock dispatch/transfer headers (warehouse→agent, agent→agent, agent→warehouse)
7. transfer_items — individual terminal line items within a transfer
8. customers — buyers mapped to sold terminals
9. sales — sale transactions linking terminal, customer, agent
10. inventory_movements — append-only ledger of every terminal movement
11. notifications — in-app notifications
12. audit_events — audit trail for sensitive operations and corrections

## Key Constraints
- terminals.serial_number is UNIQUE (prevents duplicate terminals)
- terminals status is an enum controlling lifecycle state
- A terminal can only be in one custodial state at a time (enforced by status)
- inventory_movements is append-only (no UPDATE/DELETE via RLS)
- Foreign keys enforce referential integrity

## Security
- RLS enabled on every table
- Role helper function `current_user_role()` (SECURITY DEFINER) reads role from profiles
- Field agents restricted to their own data; staff roles see all business data
- All policies scope to authenticated users
*/

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'inventory_manager', 'sales_officer', 'field_agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE terminal_status AS ENUM (
    'available',       -- in warehouse, unassigned
    'assigned',        -- held by a field agent
    'in_transit',      -- being transferred, not yet received
    'sold',            -- sold to a customer
    'returned',        -- returned to warehouse from agent/customer
    'damaged',         -- damaged, out of circulation
    'missing'          -- missing / under investigation
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('draft', 'dispatched', 'in_transit', 'received', 'partial', 'exception');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mapping_status AS ENUM ('mapped', 'pending_details');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM (
    'receipt', 'dispatch', 'transfer_receive', 'sale', 'return', 'damage', 'missing', 'correction', 'reassign'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- PROFILES (roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role user_role NOT NULL DEFAULT 'field_agent',
  agent_id uuid,  -- if role = field_agent, link to their agent record
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LOCATIONS (warehouses / stock points)
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'warehouse',  -- warehouse, office, store
  address text,
  state text,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AGENTS (field agents)
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  state text,
  city text,
  town text,
  area text,
  address text,
  notes text,
  id_document_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RECEIPT BATCHES (stock received from supplier)
-- ============================================================
CREATE TABLE IF NOT EXISTS receipt_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text UNIQUE NOT NULL,
  supplier text NOT NULL,
  delivery_ref text,
  date_received date NOT NULL DEFAULT CURRENT_DATE,
  qty_expected integer NOT NULL DEFAULT 0,
  qty_received integer NOT NULL DEFAULT 0,
  location_id uuid REFERENCES locations(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receipt_batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TERMINALS (individual POS units — core inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text UNIQUE NOT NULL,
  model text,
  receipt_batch_id uuid REFERENCES receipt_batches(id),
  supplier text,
  date_received date,
  status terminal_status NOT NULL DEFAULT 'available',
  location_id uuid REFERENCES locations(id),
  agent_id uuid REFERENCES agents(id),
  customer_id uuid,
  sale_id uuid,
  date_assigned date,
  date_sold date,
  mapping_status mapping_status,
  exception_flag boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_terminals_status ON terminals(status);
CREATE INDEX IF NOT EXISTS idx_terminals_agent ON terminals(agent_id);
CREATE INDEX IF NOT EXISTS idx_terminals_location ON terminals(location_id);
CREATE INDEX IF NOT EXISTS idx_terminals_serial ON terminals(serial_number);
CREATE INDEX IF NOT EXISTS idx_terminals_batch ON terminals(receipt_batch_id);

-- ============================================================
-- TRANSFERS (stock dispatch / transfer headers)
-- ============================================================
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_code text UNIQUE NOT NULL,
  source_type text NOT NULL,  -- 'warehouse' or 'agent'
  source_location_id uuid REFERENCES locations(id),
  source_agent_id uuid REFERENCES agents(id),
  dest_type text NOT NULL,    -- 'warehouse' or 'agent'
  dest_location_id uuid REFERENCES locations(id),
  dest_agent_id uuid REFERENCES agents(id),
  qty_total integer NOT NULL DEFAULT 0,
  qty_received integer NOT NULL DEFAULT 0,
  status transfer_status NOT NULL DEFAULT 'draft',
  dispatch_date date,
  received_date date,
  waybill_ref text,
  transferred_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRANSFER ITEMS (line items — individual terminals in a transfer)
-- ============================================================
CREATE TABLE IF NOT EXISTS transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  terminal_id uuid NOT NULL REFERENCES terminals(id),
  received boolean NOT NULL DEFAULT false,
  disputed boolean NOT NULL DEFAULT false,
  dispute_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_terminal ON transfer_items(terminal_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  state text,
  city text,
  address text,
  business_name text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_code text UNIQUE NOT NULL,
  terminal_id uuid NOT NULL REFERENCES terminals(id),
  customer_id uuid REFERENCES customers(id),
  agent_id uuid REFERENCES agents(id),
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  sale_ref text,
  channel text,
  sale_price numeric(12,2),
  mapping_status mapping_status NOT NULL DEFAULT 'pending_details',
  recorded_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sales_terminal ON sales(terminal_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

-- ============================================================
-- INVENTORY MOVEMENTS (append-only ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES terminals(id),
  movement_type movement_type NOT NULL,
  from_location_id uuid REFERENCES locations(id),
  to_location_id uuid REFERENCES locations(id),
  from_agent_id uuid REFERENCES agents(id),
  to_agent_id uuid REFERENCES agents(id),
  transfer_id uuid REFERENCES transfers(id),
  sale_id uuid REFERENCES sales(id),
  receipt_batch_id uuid REFERENCES receipt_batches(id),
  performed_by uuid REFERENCES auth.users(id),
  reference text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_movements_terminal ON inventory_movements(terminal_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  category text NOT NULL,
  title text NOT NULL,
  body text,
  related_ref text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_agents_updated ON agents;
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_terminals_updated ON terminals;
CREATE TRIGGER trg_terminals_updated BEFORE UPDATE ON terminals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_transfers_updated ON transfers;
CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROLE HELPER FUNCTION (SECURITY DEFINER — callable in RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_agent_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT agent_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role IN ('owner', 'inventory_manager', 'sales_officer') FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES: users read own profile; staff can read all; owner can manage all
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR is_staff());

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR current_user_role() = 'owner')
  WITH CHECK (auth.uid() = id OR current_user_role() = 'owner');

-- LOCATIONS: staff full access; field agents read
DROP POLICY IF EXISTS "locations_select" ON locations;
CREATE POLICY "locations_select" ON locations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "locations_insert" ON locations;
CREATE POLICY "locations_insert" ON locations FOR INSERT
  TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "locations_update" ON locations;
CREATE POLICY "locations_update" ON locations FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "locations_delete" ON locations;
CREATE POLICY "locations_delete" ON locations FOR DELETE
  TO authenticated USING (current_user_role() = 'owner');

-- AGENTS: staff full access; field agent sees only own record
DROP POLICY IF EXISTS "agents_select" ON agents;
CREATE POLICY "agents_select" ON agents FOR SELECT
  TO authenticated USING (is_staff() OR id = current_user_agent_id());

DROP POLICY IF EXISTS "agents_insert" ON agents;
CREATE POLICY "agents_insert" ON agents FOR INSERT
  TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "agents_update" ON agents;
CREATE POLICY "agents_update" ON agents FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "agents_delete" ON agents;
CREATE POLICY "agents_delete" ON agents FOR DELETE
  TO authenticated USING (current_user_role() = 'owner');

-- RECEIPT_BATCHES: staff full access; field agents read
DROP POLICY IF EXISTS "receipt_batches_select" ON receipt_batches;
CREATE POLICY "receipt_batches_select" ON receipt_batches FOR SELECT
  TO authenticated USING (is_staff() OR EXISTS (
    SELECT 1 FROM terminals t WHERE t.receipt_batch_id = receipt_batches.id AND t.agent_id = current_user_agent_id()
  ));

DROP POLICY IF EXISTS "receipt_batches_insert" ON receipt_batches;
CREATE POLICY "receipt_batches_insert" ON receipt_batches FOR INSERT
  TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "receipt_batches_update" ON receipt_batches;
CREATE POLICY "receipt_batches_update" ON receipt_batches FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- TERMINALS: staff see all; field agents see only their assigned terminals
DROP POLICY IF EXISTS "terminals_select" ON terminals;
CREATE POLICY "terminals_select" ON terminals FOR SELECT
  TO authenticated USING (is_staff() OR agent_id = current_user_agent_id());

DROP POLICY IF EXISTS "terminals_insert" ON terminals;
CREATE POLICY "terminals_insert" ON terminals FOR INSERT
  TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "terminals_update" ON terminals;
CREATE POLICY "terminals_update" ON terminals FOR UPDATE
  TO authenticated USING (is_staff() OR agent_id = current_user_agent_id())
  WITH CHECK (is_staff() OR agent_id = current_user_agent_id());

-- TRANSFERS: staff see all; field agents see transfers involving them
DROP POLICY IF EXISTS "transfers_select" ON transfers;
CREATE POLICY "transfers_select" ON transfers FOR SELECT
  TO authenticated USING (is_staff() OR source_agent_id = current_user_agent_id() OR dest_agent_id = current_user_agent_id());

DROP POLICY IF EXISTS "transfers_insert" ON transfers;
CREATE POLICY "transfers_insert" ON transfers FOR INSERT
  TO authenticated WITH CHECK (is_staff() OR source_agent_id = current_user_agent_id());

DROP POLICY IF EXISTS "transfers_update" ON transfers;
CREATE POLICY "transfers_update" ON transfers FOR UPDATE
  TO authenticated USING (is_staff() OR dest_agent_id = current_user_agent_id())
  WITH CHECK (is_staff() OR dest_agent_id = current_user_agent_id());

-- TRANSFER_ITEMS: same access as transfers
DROP POLICY IF EXISTS "transfer_items_select" ON transfer_items;
CREATE POLICY "transfer_items_select" ON transfer_items FOR SELECT
  TO authenticated USING (is_staff() OR EXISTS (
    SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id
    AND (t.source_agent_id = current_user_agent_id() OR t.dest_agent_id = current_user_agent_id())
  ));

DROP POLICY IF EXISTS "transfer_items_insert" ON transfer_items;
CREATE POLICY "transfer_items_insert" ON transfer_items FOR INSERT
  TO authenticated WITH CHECK (is_staff() OR EXISTS (
    SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id
    AND (t.source_agent_id = current_user_agent_id() OR t.dest_agent_id = current_user_agent_id())
  ));

DROP POLICY IF EXISTS "transfer_items_update" ON transfer_items;
CREATE POLICY "transfer_items_update" ON transfer_items FOR UPDATE
  TO authenticated USING (is_staff() OR EXISTS (
    SELECT 1 FROM transfers t WHERE t.id = transfer_items.transfer_id
    AND t.dest_agent_id = current_user_agent_id()
  )) WITH CHECK (is_staff());

-- CUSTOMERS: staff full access; field agents see customers from their sales
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT
  TO authenticated USING (is_staff() OR EXISTS (
    SELECT 1 FROM sales s WHERE s.customer_id = customers.id AND s.agent_id = current_user_agent_id()
  ));

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers FOR INSERT
  TO authenticated WITH CHECK (is_staff() OR current_user_agent_id() IS NOT NULL);

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- SALES: staff see all; field agents see own sales
DROP POLICY IF EXISTS "sales_select" ON sales;
CREATE POLICY "sales_select" ON sales FOR SELECT
  TO authenticated USING (is_staff() OR agent_id = current_user_agent_id());

DROP POLICY IF EXISTS "sales_insert" ON sales;
CREATE POLICY "sales_insert" ON sales FOR INSERT
  TO authenticated WITH CHECK (is_staff() OR agent_id = current_user_agent_id());

DROP POLICY IF EXISTS "sales_update" ON sales;
CREATE POLICY "sales_update" ON sales FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- INVENTORY_MOVEMENTS: staff see all; field agents see movements for their terminals
-- INSERT only (append-only). No UPDATE/DELETE.
DROP POLICY IF EXISTS "movements_select" ON inventory_movements;
CREATE POLICY "movements_select" ON inventory_movements FOR SELECT
  TO authenticated USING (is_staff() OR EXISTS (
    SELECT 1 FROM terminals t WHERE t.id = inventory_movements.terminal_id AND t.agent_id = current_user_agent_id()
  ));

DROP POLICY IF EXISTS "movements_insert" ON inventory_movements;
CREATE POLICY "movements_insert" ON inventory_movements FOR INSERT
  TO authenticated WITH CHECK (is_staff() OR EXISTS (
    SELECT 1 FROM terminals t WHERE t.id = inventory_movements.terminal_id AND t.agent_id = current_user_agent_id()
  ));

-- NOTIFICATIONS: users see only their own
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() OR is_staff());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- AUDIT_EVENTS: staff can read; system/staff can insert
DROP POLICY IF EXISTS "audit_select" ON audit_events;
CREATE POLICY "audit_select" ON audit_events FOR SELECT
  TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "audit_insert" ON audit_events;
CREATE POLICY "audit_insert" ON audit_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'field_agent')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

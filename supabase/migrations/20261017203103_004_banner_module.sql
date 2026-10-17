/*
# Banner Inventory Management

1. New Tables
- `banner_types` — catalog of banner kinds (name, sku, notes).
- `banner_receipts` — receiving batches from supplier (like receipt_batches for POS).
- `banner_receipt_items` — lines per banner type with expected/received qty.
- `banner_transfers` — warehouse → agent dispatch (draft/dispatched/in_transit/received/exception).
- `banner_transfer_items` — lines per banner type with qty dispatched/accepted/disputed.
- `banner_movements` — immutable movement ledger: receipt, transfer_out, transfer_in,
  issue_with_sale, return, damage, missing, adjustment. Each row carries the
  resulting balance context (agent/location, qty signed, linked sale/terminal).
- `banner_balances` — materialized current stock per (banner_type, location, agent).
  Maintained by RPCs/triggers, never trusted from client input.
- `banner_issue_log` — one row per banner issuance tied to a sale, with a UNIQUE
  constraint on sale_id + banner_type so a retried request cannot deduct twice.

2. Modified Tables
- none structurally; banner issuance links to existing sales/terminals/agents.

3. Security
- RLS on all tables; authenticated read/write like POS tables;
  balances writable only by SECURITY DEFINER RPCs and adjustment function.
- issue_banner_with_sale RPC is atomic: validates agent stock, deducts exactly
  once (unique issue log row), writes movement, updates balance — all in one
  transaction; sale failure rolls everything back.

4. Notes
- Quantities are integers; movement ledger is append-only (no delete policy).
*/

-- ---------------------------------------------------------
-- Catalog & receipts
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS banner_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS banner_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code text NOT NULL UNIQUE,
  supplier text NOT NULL,
  delivery_ref text,
  date_received date NOT NULL DEFAULT CURRENT_DATE,
  location_id uuid REFERENCES locations(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banner_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES banner_receipts(id) ON DELETE CASCADE,
  banner_type_id uuid NOT NULL REFERENCES banner_types(id),
  qty_expected integer NOT NULL CHECK (qty_expected >= 0),
  qty_received integer NOT NULL CHECK (qty_received >= 0),
  notes text,
  UNIQUE (receipt_id, banner_type_id)
);

-- ---------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS banner_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_code text NOT NULL UNIQUE,
  banner_type_id uuid NOT NULL REFERENCES banner_types(id),
  source_location_id uuid REFERENCES locations(id),
  dest_agent_id uuid REFERENCES agents(id),
  dest_location_id uuid REFERENCES locations(id),
  qty_dispatched integer NOT NULL CHECK (qty_dispatched > 0),
  qty_accepted integer NOT NULL DEFAULT 0 CHECK (qty_accepted >= 0),
  qty_disputed integer NOT NULL DEFAULT 0 CHECK (qty_disputed >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'dispatched', 'in_transit', 'received', 'exception')),
  dispatch_date date,
  received_date date,
  waybill_ref text,
  dispatched_by uuid REFERENCES auth.users(id),
  received_confirmed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banner_transfers_dest ON banner_transfers (dest_agent_id);

-- ---------------------------------------------------------
-- Movement ledger (append-only) + balances
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS banner_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type text NOT NULL
    CHECK (movement_type IN ('receipt','transfer_out','transfer_in','issue_with_sale','return','damage','missing','adjustment')),
  banner_type_id uuid NOT NULL REFERENCES banner_types(id),
  quantity integer NOT NULL, -- signed: positive into holder, negative out
  agent_id uuid REFERENCES agents(id),
  location_id uuid REFERENCES locations(id),
  sale_id uuid REFERENCES sales(id),
  terminal_id uuid REFERENCES terminals(id),
  transfer_id uuid REFERENCES banner_transfers(id),
  receipt_id uuid REFERENCES banner_receipts(id),
  reference text,
  reason text,
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bm_agent ON banner_movements (agent_id);
CREATE INDEX IF NOT EXISTS idx_bm_type ON banner_movements (banner_type_id);

CREATE TABLE IF NOT EXISTS banner_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_type_id uuid NOT NULL REFERENCES banner_types(id),
  agent_id uuid REFERENCES agents(id),
  location_id uuid REFERENCES locations(id),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (banner_type_id, agent_id, location_id)
);

-- ---------------------------------------------------------
-- Issue log — idempotency guard for issuing banners with a sale
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS banner_issue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  terminal_id uuid REFERENCES terminals(id),
  agent_id uuid REFERENCES agents(id),
  banner_type_id uuid NOT NULL REFERENCES banner_types(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  issued_by uuid REFERENCES auth.users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, banner_type_id)
);

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE banner_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_issue_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bt_all" ON banner_types;
CREATE POLICY "bt_all" ON banner_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "br_read" ON banner_receipts;
CREATE POLICY "br_read" ON banner_receipts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "br_insert" ON banner_receipts;
CREATE POLICY "br_insert" ON banner_receipts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));
DROP POLICY IF EXISTS "br_update" ON banner_receipts;
CREATE POLICY "br_update" ON banner_receipts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

DROP POLICY IF EXISTS "bri_read" ON banner_receipt_items;
CREATE POLICY "bri_read" ON banner_receipt_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bri_insert" ON banner_receipt_items;
CREATE POLICY "bri_insert" ON banner_receipt_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));
DROP POLICY IF EXISTS "bri_update" ON banner_receipt_items;
CREATE POLICY "bri_update" ON banner_receipt_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

DROP POLICY IF EXISTS "btr_read" ON banner_transfers;
CREATE POLICY "btr_read" ON banner_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "btr_insert" ON banner_transfers;
CREATE POLICY "btr_insert" ON banner_transfers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));
DROP POLICY IF EXISTS "btr_update" ON banner_transfers;
CREATE POLICY "btr_update" ON banner_transfers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

DROP POLICY IF EXISTS "bm_read" ON banner_movements;
CREATE POLICY "bm_read" ON banner_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bm_insert" ON banner_movements;
CREATE POLICY "bm_insert" ON banner_movements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

DROP POLICY IF EXISTS "bb_read" ON banner_balances;
CREATE POLICY "bb_read" ON banner_balances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bil_read" ON banner_issue_log;
CREATE POLICY "bil_read" ON banner_issue_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bil_insert" ON banner_issue_log;
CREATE POLICY "bil_insert" ON banner_issue_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

-- =========================================================
-- Internal helper: apply a signed quantity to a balance row
-- (SECURITY DEFINER; only callable by the RPCs below)
-- =========================================================
CREATE OR REPLACE FUNCTION banner_apply_balance(
  p_banner_type_id uuid,
  p_agent_id uuid,
  p_location_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO banner_balances (banner_type_id, agent_id, location_id, quantity)
  VALUES (p_banner_type_id, p_agent_id, p_location_id, p_delta)
  ON CONFLICT (banner_type_id, agent_id, location_id)
  DO UPDATE SET quantity = banner_balances.quantity + EXCLUDED.quantity,
                updated_at = now();

  -- Never allow a negative balance
  IF (SELECT quantity FROM banner_balances
      WHERE banner_type_id = p_banner_type_id
        AND agent_id IS NOT DISTINCT FROM p_agent_id
        AND location_id IS NOT DISTINCT FROM p_location_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient banner stock';
  END IF;
END;
$$;

-- =========================================================
-- RPC: receive banners (atomic receipt + movement + balance)
-- =========================================================
CREATE OR REPLACE FUNCTION receive_banners(
  p_receipt_code text,
  p_supplier text,
  p_date_received date,
  p_location_id uuid,
  p_banner_type_name text,
  p_banner_sku text,
  p_qty_expected integer,
  p_qty_received integer,
  p_delivery_ref text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_id uuid;
  v_type_id uuid;
  v_item_id uuid;
BEGIN
  IF p_qty_received < 0 OR p_qty_expected < 0 THEN
    RAISE EXCEPTION 'Quantities must be non-negative';
  END IF;

  -- Idempotent receipt code
  SELECT id INTO v_receipt_id FROM banner_receipts WHERE receipt_code = p_receipt_code;
  IF v_receipt_id IS NOT NULL THEN
    RETURN v_receipt_id;
  END IF;

  -- Find or create banner type
  SELECT id INTO v_type_id FROM banner_types WHERE name = p_banner_type_name;
  IF v_type_id IS NULL THEN
    INSERT INTO banner_types (name, sku) VALUES (p_banner_type_name, p_banner_sku)
    RETURNING id INTO v_type_id;
  END IF;

  INSERT INTO banner_receipts (receipt_code, supplier, delivery_ref, date_received, location_id, notes, created_by)
  VALUES (p_receipt_code, p_supplier, p_delivery_ref, p_date_received, p_location_id, p_notes, auth.uid())
  RETURNING id INTO v_receipt_id;

  INSERT INTO banner_receipt_items (receipt_id, banner_type_id, qty_expected, qty_received)
  VALUES (v_receipt_id, v_type_id, p_qty_expected, p_qty_received)
  RETURNING id INTO v_item_id;

  -- Movement + balance: accepted qty into location
  INSERT INTO banner_movements (movement_type, banner_type_id, quantity, location_id, receipt_id, reference, performed_by)
  VALUES ('receipt', v_type_id, p_qty_received, p_location_id, v_receipt_id, p_receipt_code, auth.uid());

  PERFORM banner_apply_balance(v_type_id, NULL, p_location_id, p_qty_received);

  INSERT INTO audit_events (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'receive_banners', 'banner_receipt', v_receipt_id,
    jsonb_build_object('type', p_banner_type_name, 'qty', p_qty_received, 'expected', p_qty_expected));

  RETURN v_receipt_id;
END;
$$;

-- =========================================================
-- RPC: dispatch banner transfer (warehouse → agent)
-- =========================================================
CREATE OR REPLACE FUNCTION dispatch_banner_transfer(
  p_transfer_code text,
  p_banner_type_id uuid,
  p_source_location_id uuid,
  p_dest_agent_id uuid,
  p_qty integer,
  p_waybill_ref text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
BEGIN
  IF p_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT id INTO v_transfer_id FROM banner_transfers WHERE transfer_code = p_transfer_code;
  IF v_transfer_id IS NOT NULL THEN RETURN v_transfer_id; END IF;

  INSERT INTO banner_transfers (transfer_code, banner_type_id, source_location_id, dest_agent_id,
    qty_dispatched, status, dispatch_date, waybill_ref, dispatched_by, notes)
  VALUES (p_transfer_code, p_banner_type_id, p_source_location_id, p_dest_agent_id,
    p_qty, 'in_transit', CURRENT_DATE, p_waybill_ref, auth.uid(), p_notes)
  RETURNING id INTO v_transfer_id;

  -- Deduct from source immediately; stock is in transit
  INSERT INTO banner_movements (movement_type, banner_type_id, quantity, location_id, agent_id, transfer_id, reference, performed_by)
  VALUES ('transfer_out', p_banner_type_id, -p_qty, p_source_location_id, NULL, v_transfer_id, p_transfer_code, auth.uid());

  PERFORM banner_apply_balance(p_banner_type_id, NULL, p_source_location_id, -p_qty);

  RETURN v_transfer_id;
END;
$$;

-- =========================================================
-- RPC: confirm banner transfer receipt (accept/dispute)
-- =========================================================
CREATE OR REPLACE FUNCTION confirm_banner_transfer(
  p_transfer_id uuid,
  p_qty_accepted integer,
  p_qty_disputed integer,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
BEGIN
  SELECT * INTO v_t FROM banner_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_t.status = 'received' THEN RETURN; END IF; -- idempotent
  IF p_qty_accepted + p_qty_disputed <> v_t.qty_dispatched THEN
    RAISE EXCEPTION 'Accepted + disputed must equal dispatched quantity';
  END IF;

  UPDATE banner_transfers
  SET qty_accepted = p_qty_accepted, qty_disputed = p_qty_disputed,
      status = CASE WHEN p_qty_disputed > 0 THEN 'exception' ELSE 'received' END,
      received_date = CURRENT_DATE,
      received_confirmed_by = auth.uid(),
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_transfer_id;

  -- Accepted qty moves into the agent's balance
  IF p_qty_accepted > 0 THEN
    INSERT INTO banner_movements (movement_type, banner_type_id, quantity, agent_id, transfer_id, reference, reason, performed_by)
    VALUES ('transfer_in', v_t.banner_type_id, p_qty_accepted, v_t.dest_agent_id, v_t.id, v_t.transfer_code, p_note, auth.uid());

    PERFORM banner_apply_balance(v_t.banner_type_id, v_t.dest_agent_id, NULL, p_qty_accepted);
  END IF;
END;
$$;

-- =========================================================
-- RPC: issue banners with a sale (atomic + idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION issue_banner_with_sale(
  p_sale_id uuid,
  p_banner_type_id uuid,
  p_quantity integer,
  p_agent_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_issue_id uuid;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT id, terminal_id, agent_id INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;

  -- Idempotency: already issued for this sale + type → return existing
  SELECT id INTO v_issue_id FROM banner_issue_log
  WHERE sale_id = p_sale_id AND banner_type_id = p_banner_type_id;
  IF v_issue_id IS NOT NULL THEN RETURN v_issue_id; END IF;

  -- Authorization: sale must belong to the agent issuing (or be a direct/owner sale)
  IF v_sale.agent_id IS NOT NULL AND p_agent_id IS NOT NULL AND v_sale.agent_id <> p_agent_id THEN
    RAISE EXCEPTION 'Sale does not belong to this agent';
  END IF;

  -- Deduct from the custodian: the sale's agent, else the warehouse
  IF v_sale.agent_id IS NOT NULL THEN
    -- Validate available agent stock first for a clear error
    IF NOT EXISTS (
      SELECT 1 FROM banner_balances
      WHERE banner_type_id = p_banner_type_id AND agent_id = v_sale.agent_id AND quantity >= p_quantity
    ) THEN
      RAISE EXCEPTION 'Agent has insufficient banner stock (need %)', p_quantity;
    END IF;

    INSERT INTO banner_issue_log (sale_id, terminal_id, agent_id, banner_type_id, quantity, issued_by)
    VALUES (p_sale_id, v_sale.terminal_id, v_sale.agent_id, p_banner_type_id, p_quantity, auth.uid())
    RETURNING id INTO v_issue_id;

    INSERT INTO banner_movements (movement_type, banner_type_id, quantity, agent_id, sale_id, terminal_id, reference, performed_by)
    VALUES ('issue_with_sale', p_banner_type_id, -p_quantity, v_sale.agent_id, p_sale_id, v_sale.terminal_id, 'Issued with sale', auth.uid());

    PERFORM banner_apply_balance(p_banner_type_id, v_sale.agent_id, NULL, -p_quantity);
  ELSE
    -- Direct/warehouse sale: deduct from main warehouse location
    IF NOT EXISTS (
      SELECT 1 FROM banner_balances
      WHERE banner_type_id = p_banner_type_id AND agent_id IS NULL AND quantity >= p_quantity
    ) THEN
      RAISE EXCEPTION 'Warehouse has insufficient banner stock (need %)', p_quantity;
    END IF;

    INSERT INTO banner_issue_log (sale_id, terminal_id, agent_id, banner_type_id, quantity, issued_by)
    VALUES (p_sale_id, v_sale.terminal_id, NULL, p_banner_type_id, p_quantity, auth.uid())
    RETURNING id INTO v_issue_id;

    INSERT INTO banner_movements (movement_type, banner_type_id, quantity, location_id, sale_id, terminal_id, reference, performed_by)
    VALUES ('issue_with_sale', p_banner_type_id, -p_quantity, (SELECT location_id FROM banner_balances WHERE banner_type_id = p_banner_type_id AND agent_id IS NULL LIMIT 1), p_sale_id, v_sale.terminal_id, 'Issued with sale', auth.uid());

    PERFORM banner_apply_balance(p_banner_type_id, NULL, NULL, -p_quantity);
  END IF;

  RETURN v_issue_id;
END;
$$;

-- =========================================================
-- RPC: banner stock adjustment (reconciliation; never deletes history)
-- =========================================================
CREATE OR REPLACE FUNCTION adjust_banner_stock(
  p_banner_type_id uuid,
  p_agent_id uuid,
  p_location_id uuid,
  p_new_quantity integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_delta integer;
  v_movement_type text;
BEGIN
  IF p_new_quantity < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason is required'; END IF;

  SELECT quantity INTO v_current FROM banner_balances
  WHERE banner_type_id = p_banner_type_id
    AND agent_id IS NOT DISTINCT FROM p_agent_id
    AND location_id IS NOT DISTINCT FROM p_location_id;
  v_current := COALESCE(v_current, 0);
  v_delta := p_new_quantity - v_current;
  IF v_delta = 0 THEN RETURN; END IF;

  v_movement_type := CASE
    WHEN p_agent_id IS NOT NULL AND v_delta < 0 THEN
      CASE WHEN p_new_quantity < v_current THEN 'damage' ELSE 'return' END
    WHEN v_delta < 0 THEN 'missing'
    ELSE 'adjustment'
  END;

  INSERT INTO banner_movements (movement_type, banner_type_id, quantity, agent_id, location_id, reference, reason, performed_by)
  VALUES (v_movement_type, p_banner_type_id, v_delta, p_agent_id, p_location_id, 'reconciliation', p_reason, auth.uid());

  PERFORM banner_apply_balance(p_banner_type_id, p_agent_id, p_location_id, v_delta);

  INSERT INTO audit_events (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'adjust_banner_stock', 'banner_balance', NULL,
    jsonb_build_object('type', p_banner_type_id, 'agent', p_agent_id, 'location', p_location_id,
      'from', v_current, 'to', p_new_quantity, 'reason', p_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION receive_banners, dispatch_banner_transfer, confirm_banner_transfer,
  issue_banner_with_sale, adjust_banner_stock, banner_apply_balance FROM anon;
GRANT EXECUTE ON FUNCTION receive_banners, dispatch_banner_transfer, confirm_banner_transfer,
  issue_banner_with_sale, adjust_banner_stock TO authenticated;

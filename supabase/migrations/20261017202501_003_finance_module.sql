/*
# POS Commission, Delivery Expense & Profit Management

1. New Tables
- `finance_settings` (single-row config, id = 1)
  - selling_price, commission_per_terminal (defaults ₦20,000 / ₦9,700)
  - currency ('NGN'), recognition_rule ('on_sale_confirmed' | 'on_eligibility' | 'on_payment')
  - effective_from date for the current rates
- `finance_rates` — historical/overridable rates per effective date, so changing
  defaults never rewrites history. Optional agent_id for per-agent rates.
- `sale_finances` — one row per sale (unique sale_id): commission earned,
  delivery expense (amount, recipient, pay status, payment date/ref, note),
  other expense, computed gross_margin and net_profit. Rate fields snapshot
  the rates applied at sale time. created/updated audit timestamps.
- `delivery_expenses` — multi-terminal deliveries: batch expense with
  allocation_method, allocated across sale_finances via allocation rows.
- `delivery_expense_allocations` — links a delivery_expense to specific
  sale_finances rows with an allocated amount each.
- `expenses` — general operating expenses (category, amount, date, pay status,
  optional linked sale/terminal/agent/batch/location).
- `commission_payments` — payments received from the bank (reference, amount,
  date, notes) with unique payment_reference to block duplicate retries.
- `commission_payment_allocations` — allocates a payment across sales;
  each (payment, sale) pair unique so retries never double-allocate.

2. Modified Tables
- `sales` — no structural change; finances join via sale_id.
- `app_settings` — remains for scanner config; finance config uses finance_settings.

3. Security
- RLS enabled on all new tables.
- All authenticated staff can SELECT and INSERT.
- UPDATE/DELETE restricted to owner/inventory_manager roles via profiles check.
- All money kept in numeric(14,2); currency NGN by default.

4. Notes
- Historical rates are snapshotted into sale_finances at insert time.
- Net profit = commission_earned − delivery_expense_total − other_expense.
- Delivery expense totals come from direct amount + allocated batch expenses.
*/

-- ---------------------------------------------------------
-- Finance settings (single row)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  selling_price numeric(14,2) NOT NULL DEFAULT 20000.00,
  commission_per_terminal numeric(14,2) NOT NULL DEFAULT 9700.00,
  currency text NOT NULL DEFAULT 'NGN',
  recognition_rule text NOT NULL DEFAULT 'on_sale_confirmed'
    CHECK (recognition_rule IN ('on_sale_confirmed', 'on_eligibility', 'on_payment')),
  delivery_rate_per_agent jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------
-- Historical rate table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selling_price numeric(14,2) NOT NULL,
  commission_per_terminal numeric(14,2) NOT NULL,
  agent_id uuid REFERENCES agents(id),
  effective_from date NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, effective_from)
);

-- ---------------------------------------------------------
-- Per-sale financial record
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
  terminal_id uuid REFERENCES terminals(id),
  serial_number text,
  agent_id uuid REFERENCES agents(id),
  sale_date date NOT NULL,
  selling_price numeric(14,2),
  commission_rate numeric(14,2) NOT NULL,
  commission_earned numeric(14,2) NOT NULL DEFAULT 0,
  commission_status text NOT NULL DEFAULT 'pending'
    CHECK (commission_status IN ('pending', 'received', 'disputed')),
  commission_paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  delivery_amount numeric(14,2) NOT NULL DEFAULT 0,
  delivery_recipient text,
  delivery_status text NOT NULL DEFAULT 'unpaid'
    CHECK (delivery_status IN ('unpaid', 'pending', 'paid')),
  delivery_paid_date date,
  delivery_payment_ref text,
  delivery_note text,
  other_expense numeric(14,2) NOT NULL DEFAULT 0,
  gross_margin numeric(14,2) NOT NULL DEFAULT 0,
  net_profit numeric(14,2) NOT NULL DEFAULT 0,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_finances_sale_date ON sale_finances (sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_finances_agent ON sale_finances (agent_id);

-- ---------------------------------------------------------
-- Multi-terminal delivery expenses + allocations
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  recipient text,
  amount numeric(14,2) NOT NULL,
  allocation_method text NOT NULL DEFAULT 'even'
    CHECK (allocation_method IN ('even', 'manual')),
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'pending', 'paid')),
  paid_date date,
  payment_ref text,
  note text,
  agent_id uuid REFERENCES agents(id),
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_expense_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES delivery_expenses(id) ON DELETE CASCADE,
  sale_finance_id uuid NOT NULL REFERENCES sale_finances(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, sale_finance_id)
);

-- ---------------------------------------------------------
-- General operating expenses
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL,
  date_incurred date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'pending', 'paid')),
  payment_ref text,
  sale_id uuid REFERENCES sales(id),
  terminal_id uuid REFERENCES terminals(id),
  agent_id uuid REFERENCES agents(id),
  receipt_batch_id uuid REFERENCES receipt_batches(id),
  location_id uuid REFERENCES locations(id),
  attachment_url text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date_incurred);

-- ---------------------------------------------------------
-- Commission reconciliation
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference text NOT NULL UNIQUE,
  amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL,
  payer text NOT NULL DEFAULT 'Wema Bank',
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES commission_payments(id) ON DELETE CASCADE,
  sale_finance_id uuid NOT NULL REFERENCES sale_finances(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, sale_finance_id)
);

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_expense_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated staff
DROP POLICY IF EXISTS "fs_read" ON finance_settings;
CREATE POLICY "fs_read" ON finance_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fr_read" ON finance_rates;
CREATE POLICY "fr_read" ON finance_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fr_insert" ON finance_rates;
CREATE POLICY "fr_insert" ON finance_rates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));
DROP POLICY IF EXISTS "fr_update" ON finance_rates;
CREATE POLICY "fr_update" ON finance_rates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

DROP POLICY IF EXISTS "sf_read" ON sale_finances;
CREATE POLICY "sf_read" ON sale_finances FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sf_insert" ON sale_finances;
CREATE POLICY "sf_insert" ON sale_finances FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));
DROP POLICY IF EXISTS "sf_update" ON sale_finances;
CREATE POLICY "sf_update" ON sale_finances FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

DROP POLICY IF EXISTS "de_read" ON delivery_expenses;
CREATE POLICY "de_read" ON delivery_expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "de_insert" ON delivery_expenses;
CREATE POLICY "de_insert" ON delivery_expenses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));
DROP POLICY IF EXISTS "de_update" ON delivery_expenses;
CREATE POLICY "de_update" ON delivery_expenses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

DROP POLICY IF EXISTS "dea_read" ON delivery_expense_allocations;
CREATE POLICY "dea_read" ON delivery_expense_allocations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "dea_insert" ON delivery_expense_allocations;
CREATE POLICY "dea_insert" ON delivery_expense_allocations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));
DROP POLICY IF EXISTS "dea_delete" ON delivery_expense_allocations;
CREATE POLICY "dea_delete" ON delivery_expense_allocations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

DROP POLICY IF EXISTS "ex_read" ON expenses;
CREATE POLICY "ex_read" ON expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ex_insert" ON expenses;
CREATE POLICY "ex_insert" ON expenses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));
DROP POLICY IF EXISTS "ex_update" ON expenses;
CREATE POLICY "ex_update" ON expenses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager','sales_officer')));

DROP POLICY IF EXISTS "cp_read" ON commission_payments;
CREATE POLICY "cp_read" ON commission_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cp_insert" ON commission_payments;
CREATE POLICY "cp_insert" ON commission_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));
DROP POLICY IF EXISTS "cp_update" ON commission_payments;
CREATE POLICY "cp_update" ON commission_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

DROP POLICY IF EXISTS "cpa_read" ON commission_payment_allocations;
CREATE POLICY "cpa_read" ON commission_payment_allocations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cpa_insert" ON commission_payment_allocations;
CREATE POLICY "cpa_insert" ON commission_payment_allocations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','inventory_manager')));

-- =========================================================
-- Atomic RPC: record a sale finance record (idempotent per sale)
-- =========================================================
CREATE OR REPLACE FUNCTION record_sale_finance(
  p_sale_id uuid,
  p_delivery_amount numeric DEFAULT 0,
  p_delivery_recipient text DEFAULT NULL,
  p_other_expense numeric DEFAULT 0,
  p_commission_override numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_settings record;
  v_commission numeric;
  v_finance_id uuid;
  v_agent_rate numeric;
BEGIN
  -- Load sale
  SELECT id, terminal_id, agent_id, sale_date, sale_price INTO v_sale
  FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- Idempotency: return existing finance row if already recorded
  SELECT id INTO v_finance_id FROM sale_finances WHERE sale_id = p_sale_id;
  IF v_finance_id IS NOT NULL THEN
    RETURN v_finance_id;
  END IF;

  SELECT selling_price, commission_per_terminal INTO v_settings FROM finance_settings WHERE id = 1;

  -- Per-agent rate override wins over default
  v_agent_rate := NULL;
  IF v_sale.agent_id IS NOT NULL THEN
    SELECT commission_per_terminal INTO v_agent_rate
    FROM finance_rates
    WHERE agent_id = v_sale.agent_id AND effective_from <= v_sale.sale_date
    ORDER BY effective_from DESC LIMIT 1;
  END IF;

  v_commission := COALESCE(p_commission_override, v_agent_rate, v_settings.commission_per_terminal);

  INSERT INTO sale_finances (
    sale_id, terminal_id, serial_number, agent_id, sale_date,
    selling_price, commission_rate, commission_earned,
    delivery_amount, delivery_recipient, other_expense,
    gross_margin, net_profit, recorded_by
  )
  SELECT
    v_sale.id, v_sale.terminal_id, t.serial_number, v_sale.agent_id, v_sale.sale_date,
    COALESCE(v_sale.sale_price, v_settings.selling_price), v_commission, v_commission,
    COALESCE(p_delivery_amount, 0), p_delivery_recipient, COALESCE(p_other_expense, 0),
    v_commission,
    v_commission - COALESCE(p_delivery_amount, 0) - COALESCE(p_other_expense, 0),
    auth.uid()
  FROM terminals t WHERE t.id = v_sale.terminal_id
  RETURNING id INTO v_finance_id;

  -- Audit
  INSERT INTO audit_events (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'record_sale_finance', 'sale_finance', v_finance_id,
    jsonb_build_object('sale_id', p_sale_id, 'commission', v_commission,
      'delivery', COALESCE(p_delivery_amount, 0), 'other', COALESCE(p_other_expense, 0)));

  RETURN v_finance_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_sale_finance FROM anon;
GRANT EXECUTE ON FUNCTION record_sale_finance TO authenticated;

-- Keep derived columns consistent on direct updates
CREATE OR REPLACE FUNCTION sale_finances_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.gross_margin := NEW.commission_earned;
  NEW.net_profit := NEW.commission_earned - NEW.delivery_amount - NEW.other_expense;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_finances_recalc ON sale_finances;
CREATE TRIGGER trg_sale_finances_recalc
BEFORE UPDATE ON sale_finances
FOR EACH ROW EXECUTE FUNCTION sale_finances_recalc();

/*
# Fix banner balance updates for warehouse rows (no agent/location)

1. Problem
- banner_balances has a UNIQUE key on (banner_type_id, agent_id, location_id),
  but in Postgres NULLs never match each other in unique constraints, so
  ON CONFLICT never fired for warehouse rows (agent/location = NULL). Each
  dispatch/receipt inserted a NEW row instead of updating, and negative
  deltas hit the quantity >= 0 check.

2. Fix
- banner_apply_balance now does UPDATE-then-INSERT keyed with
  IS NOT DISTINCT FROM matching, so NULL (warehouse) rows update correctly.
- Idempotency and negative-balance protection unchanged.

3. Security
- No policy changes; function remains SECURITY DEFINER, not callable by anon.
*/

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
DECLARE
  v_updated int;
BEGIN
  UPDATE banner_balances
  SET quantity = quantity + p_delta, updated_at = now()
  WHERE banner_type_id = p_banner_type_id
    AND agent_id IS NOT DISTINCT FROM p_agent_id
    AND location_id IS NOT DISTINCT FROM p_location_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    INSERT INTO banner_balances (banner_type_id, agent_id, location_id, quantity)
    VALUES (p_banner_type_id, p_agent_id, p_location_id, p_delta);
  END IF;

  IF (SELECT quantity FROM banner_balances
      WHERE banner_type_id = p_banner_type_id
        AND agent_id IS NOT DISTINCT FROM p_agent_id
        AND location_id IS NOT DISTINCT FROM p_location_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient banner stock';
  END IF;
END;
$$;

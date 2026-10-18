/*
# Harden SECURITY DEFINER function permissions

1. Problem
- Postgres grants EXECUTE to PUBLIC by default. Revoking from `anon` alone
  left every SECURITY DEFINER function callable through the public role.
- Two trigger/helper functions had no fixed search_path.

2. Fix
- REVOKE EXECUTE FROM PUBLIC + anon on all SECURITY DEFINER functions;
  grant only to `authenticated`.
- SET search_path = '' (schema-qualified bodies) on set_updated_at and
  sale_finances_recalc.

3. Security
- No data or policy changes; privilege hardening only.
*/

REVOKE EXECUTE ON FUNCTION record_sale_finance FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION receive_banners FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION dispatch_banner_transfer FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION confirm_banner_transfer FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION issue_banner_with_sale FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION adjust_banner_stock FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION banner_apply_balance FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_sale_finance TO authenticated;
GRANT EXECUTE ON FUNCTION receive_banners TO authenticated;
GRANT EXECUTE ON FUNCTION dispatch_banner_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_banner_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION issue_banner_with_sale TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_banner_stock TO authenticated;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sale_finances_recalc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.gross_margin := NEW.commission_earned;
  NEW.net_profit := NEW.commission_earned - NEW.delivery_amount - NEW.other_expense;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

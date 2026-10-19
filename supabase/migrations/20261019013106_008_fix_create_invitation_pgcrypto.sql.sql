-- Fix: gen_random_bytes lives in the extensions schema, but create_invitation
-- sets search_path = public so the unqualified call fails. Use gen_random_uuid()
-- (built into core Postgres) to derive the pass key instead.
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_phone text,
  p_role user_role,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_role user_role;
  key text;
  row invitations%ROWTYPE;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO caller_role FROM profiles WHERE id = caller;
  IF caller_role IS NULL THEN RAISE EXCEPTION 'No profile'; END IF;

  -- Only staff may issue invitations.
  IF caller_role NOT IN ('owner', 'inventory_manager', 'sales_officer') THEN
    RAISE EXCEPTION 'Only staff may issue invitations';
  END IF;

  IF p_role = 'owner' AND caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only Super Admin may issue Super Admin invitations';
  END IF;

  -- Derive a URL-safe 24-char key from a fresh UUID (hex, no dashes).
  key := replace(gen_random_uuid()::text, '-', '');
  key := substr(key, 1, 24);

  INSERT INTO invitations (pass_key, phone, role, created_by, expires_at, full_name)
  VALUES (key, p_phone, p_role, caller, p_expires_at, p_full_name)
  RETURNING * INTO row;

  INSERT INTO audit_events (user_id, action, entity_type, entity_id)
  VALUES (caller, 'invitation_created', 'invitation', row.id);

  RETURN row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_invitation(text, user_role, timestamp with time zone, text)
  TO authenticated, anon;

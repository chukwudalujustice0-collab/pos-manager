-- Allow a prospective signup to look up their active invitation by phone number.
-- Returns the pass_key so the signup form can auto-fill it. This is safe because
-- the pass key is already meant to be shared with the person who owns this phone
-- number, and the key can only be redeemed once with a matching phone.
CREATE OR REPLACE FUNCTION public.lookup_invitation_by_phone(p_phone text)
RETURNS TABLE (pass_key text, role user_role, full_name text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized text;
BEGIN
  normalized := regexp_replace(p_phone, '[^0-9]', '', 'g');
  RETURN QUERY
  SELECT i.pass_key, i.role, i.full_name, i.expires_at
  FROM invitations i
  WHERE i.status = 'active'
    AND i.redeemed_by IS NULL
    AND (i.expires_at IS NULL OR i.expires_at >= now())
    AND regexp_replace(i.phone, '[^0-9]', '', 'g') = normalized
  ORDER BY i.created_at DESC
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lookup_invitation_by_phone(text)
  TO authenticated, anon;

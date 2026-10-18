/*
# Final function privilege tightening

1. What
- Pre-existing auth helper functions (current_user_role, current_user_agent_id,
  is_staff, handle_new_user — from the initial schema) were still granted to
  PUBLIC. handle_new_user is the auth trigger function and must stay
  callable by the system; the read-only helpers are safe for authenticated
  users, so PUBLIC is revoked and authenticated kept.
- The banner/finance RPCs are intentionally executable by authenticated
  users (that is how the app writes data). The linter's remaining
  "Signed-In Users Can Execute" notes are expected — the functions enforce
  role checks internally and RLS still applies to every table they touch.

2. Security
- Privilege hardening only; no data changes.
*/

REVOKE EXECUTE ON FUNCTION current_user_agent_id FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION current_user_role FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_staff FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_agent_id TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff TO authenticated;

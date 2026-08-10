-- SEC-M2: revocación inmediata de sesiones desde Edge Functions admin
-- (toggle-user-status, reset-user-password). auth.sessions/refresh_tokens no
-- son accesibles vía PostgREST; se expone una RPC SECURITY DEFINER solo para
-- service_role.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.refresh_tokens
  WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = _user_id);
  DELETE FROM auth.sessions WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

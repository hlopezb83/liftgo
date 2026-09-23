-- A user may edit their own profile. Admins edit other profiles only through
-- the separate policies scoped to members of their current organization.
-- Without this narrowing, the self-update policy grants a global admin UPDATE
-- predicate and relies on SELECT RLS to stop cross-organization writes.
ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.profile_update_preserves_protected(user_id, is_active, email)
  );

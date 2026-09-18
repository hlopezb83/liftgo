CREATE OR REPLACE FUNCTION public.update_user_role_safe(
  _target_user_id uuid,
  _new_role app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_was_admin boolean;
  v_admin_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: solo administradores pueden cambiar roles';
  END IF;
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id_required';
  END IF;

  PERFORM 1
    FROM public.user_roles
   WHERE role = 'admin'::app_role
   FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _target_user_id
       AND role = 'admin'::app_role
  ) INTO v_was_admin;

  IF v_was_admin AND _new_role <> 'admin'::app_role THEN
    SELECT count(*)::int INTO v_admin_count
      FROM public.user_roles
     WHERE role = 'admin'::app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DEMOTED'
        USING HINT = 'no puedes degradar al último administrador del sistema.';
    END IF;
  END IF;

  UPDATE public.user_roles
     SET role = _new_role
   WHERE user_id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_role_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_role_safe(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role_safe(uuid, app_role) TO authenticated;

COMMENT ON FUNCTION public.update_user_role_safe(uuid, app_role) IS
  'Cambia el rol de un usuario bloqueando la degradación del último admin. Solo ejecutable por admins.';
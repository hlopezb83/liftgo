
-- =====================================================
-- Ola 2.6 — Segregación de roles y edge cases (v7.122.0)
-- =====================================================

-- 1) BL-M1: dispatcher solo lectura en invoices y payments
DROP POLICY IF EXISTS "Dispatchers full access invoices" ON public.invoices;
CREATE POLICY "Dispatchers read invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'::app_role));

DROP POLICY IF EXISTS "Dispatchers full access payments" ON public.payments;
CREATE POLICY "Dispatchers read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'::app_role));

-- 2) BL-M1: created_by en payments para trazabilidad
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Default cuando el insert corre bajo un JWT autenticado
ALTER TABLE public.payments
  ALTER COLUMN created_by SET DEFAULT auth.uid();

COMMENT ON COLUMN public.payments.created_by IS
  'Usuario autenticado que registró el pago. NULL para registros históricos previos a v7.122.0.';

-- 3) EC-M5: guarda anti-último-admin como RPC transaccional con lock
CREATE OR REPLACE FUNCTION public.assert_not_last_admin(_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_admin_count integer;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id_required';
  END IF;

  -- Lock exclusivo sobre las filas admin para cerrar TOCTOU entre chequeo y delete.
  PERFORM 1
    FROM public.user_roles
   WHERE role = 'admin'::app_role
   FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _target_user_id
       AND role = 'admin'::app_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_admin_count
    FROM public.user_roles
   WHERE role = 'admin'::app_role;

  IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'LAST_ADMIN_CANNOT_BE_DELETED'
      USING HINT = 'no puedes eliminar al último administrador del sistema.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_not_last_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_not_last_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.assert_not_last_admin(uuid) IS
  'Bloquea el borrado si _target_user_id es el último admin. Usa FOR UPDATE para evitar carreras.';

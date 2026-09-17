-- =====================================================================
-- Multi-organización · Fase 5.1 (contexto y portal)
--
-- Hallazgo: `get_customer_id_for_user` usaba COALESCE(cuenta portal activa,
-- customers.user_id). Una cuenta de portal SUSPENDIDA o REVOCADA caía al
-- respaldo legado y recuperaba acceso mientras existiera una sola organización
-- activa. El respaldo ahora sólo aplica cuando el usuario NO tiene ninguna
-- cuenta de portal registrada (clientes previos a customer_portal_accounts).
--
-- No se relaja ninguna policy de Storage ni de pagos (8.8.15): esas reglas
-- consumen esta función, que aquí se vuelve más estricta.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_customer_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT a.customer_id
      FROM public.customer_portal_accounts a
      WHERE a.auth_user_id = p_user_id
        AND a.status = 'active'
      LIMIT 1
    ),
    (
      SELECT c.id
      FROM public.customers c
      WHERE c.user_id = p_user_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.customer_portal_accounts a2
          WHERE a2.auth_user_id = p_user_id
        )
        AND (
          SELECT count(*) = 1
          FROM public.organizations
          WHERE is_active
        )
      LIMIT 1
    )
  )
$$;

REVOKE ALL ON FUNCTION public.get_customer_id_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_id_for_user(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_customer_id_for_user(uuid) IS
  'Cliente del portal: cuenta de portal activa; el respaldo legado customers.user_id solo aplica cuando el usuario no tiene ninguna cuenta de portal y existe una sola organizacion activa.';
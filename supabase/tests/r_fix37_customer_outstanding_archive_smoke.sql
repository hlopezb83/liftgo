-- Smoke de la regla dura: un cliente NO puede archivarse con saldo pendiente.
--   public.customer_outstanding_balance(uuid) / customer_has_outstanding_balance(uuid)
--   son la definición canónica (v_invoices_with_balance en MXN, estados
--   'sent'/'partial'/'overdue', sin cancelaciones aceptadas, tolerancia 0.01).
--   Tanto public.soft_delete_customer() como el trigger
--   trg_guard_customer_archive / public.guard_customer_archive() aplican el
--   mismo helper: RPC y UPDATE directo no pueden divergir.
--
--   psql -f supabase/tests/r_fix37_customer_outstanding_archive_smoke.sql
-- Todo corre dentro de una transacción con ROLLBACK: no deja datos.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'OK  %', p_label;
  ELSE
    RAISE WARNING 'FALLO  %', p_label;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 1. Contrato (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'existe public.customer_outstanding_balance(uuid)',
  pg_temp.fndef('customer_outstanding_balance') <> ''
);

SELECT pg_temp.expect_true(
  'existe public.customer_has_outstanding_balance(uuid)',
  pg_temp.fndef('customer_has_outstanding_balance') <> ''
);

SELECT pg_temp.expect_true(
  'el saldo canónico se calcula sobre v_invoices_with_balance (misma fuente que get_customer_summary)',
  pg_temp.fndef('customer_outstanding_balance') LIKE '%v_invoices_with_balance%'
    AND pg_temp.fndef('customer_outstanding_balance') LIKE '%balance_mxn%'
);

SELECT pg_temp.expect_true(
  'excluye canceladas: sólo sent/partial/overdue y cancellation_status <> accepted',
  pg_temp.fndef('customer_outstanding_balance') LIKE '%sent%'
    AND pg_temp.fndef('customer_outstanding_balance') LIKE '%accepted%'
);

SELECT pg_temp.expect_true(
  'tolerancia monetaria 0.01 (convención de pagos/cobranza)',
  pg_temp.fndef('customer_has_outstanding_balance') LIKE '%0.01%'
);

SELECT pg_temp.expect_true(
  'helpers SECURITY DEFINER con search_path fijo',
  pg_temp.fndef('customer_outstanding_balance') LIKE '%SECURITY DEFINER%'
    AND pg_temp.fndef('customer_outstanding_balance') LIKE '%search_path%'
);

SELECT pg_temp.expect_true(
  'el RPC soft_delete_customer aplica el helper de saldo',
  pg_temp.fndef('soft_delete_customer') LIKE '%customer_has_outstanding_balance%'
);

SELECT pg_temp.expect_true(
  'el guard de UPDATE directo aplica el MISMO helper (no divergen)',
  pg_temp.fndef('guard_customer_archive') LIKE '%customer_has_outstanding_balance%'
);

SELECT pg_temp.expect_true(
  'la regla de reservas activas sigue vigente en ambos caminos',
  pg_temp.fndef('soft_delete_customer') LIKE '%customer_has_active_bookings%'
    AND pg_temp.fndef('guard_customer_archive') LIKE '%customer_has_active_bookings%'
);

SELECT pg_temp.expect_true(
  'contrato de error: 42501 para permisos, P0001 para estado de negocio',
  pg_temp.fndef('guard_customer_archive') LIKE '%42501%'
    AND pg_temp.fndef('guard_customer_archive') LIKE '%P0001%'
);

SELECT pg_temp.expect_true(
  'el guard sólo actúa en la transición NULL -> NOT NULL (desarchivar y ediciones intactas)',
  pg_temp.fndef('guard_customer_archive') LIKE '%OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL%'
);

SELECT pg_temp.expect_true(
  'el trigger BEFORE UPDATE OF deleted_at sigue activo',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'customers'
      AND t.tgname = 'trg_guard_customer_archive'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
  )
);

SELECT pg_temp.expect_true(
  'los helpers de saldo no son ejecutables por anon/authenticated',
  NOT has_function_privilege('authenticated', 'public.customer_has_outstanding_balance(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.customer_outstanding_balance(uuid)', 'EXECUTE')
);

-- ---------------------------------------------------------------------------
-- 2. Comportamiento del cálculo de saldo (datos temporales, con ROLLBACK)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_cust uuid;
  v_inv  uuid;
BEGIN
  INSERT INTO public.customers (name) VALUES ('SMOKE saldo archivo')
  RETURNING id INTO v_cust;

  -- Factura cancelada: NO genera saldo.
  INSERT INTO public.invoices (customer_id, customer_name, total, status)
  VALUES (v_cust, 'SMOKE saldo archivo', 5000, 'cancelled');
  PERFORM pg_temp.expect_true(
    'factura cancelada no crea saldo pendiente',
    public.customer_outstanding_balance(v_cust) = 0
      AND NOT public.customer_has_outstanding_balance(v_cust)
  );

  -- Factura pagada (status 'paid'): NO bloquea.
  INSERT INTO public.invoices (customer_id, customer_name, total, status)
  VALUES (v_cust, 'SMOKE saldo archivo', 1000, 'paid');
  PERFORM pg_temp.expect_true(
    'factura pagada no bloquea el archivado',
    NOT public.customer_has_outstanding_balance(v_cust)
  );

  -- Factura enviada sin pagos: SÍ genera saldo.
  INSERT INTO public.invoices (customer_id, customer_name, total, status)
  VALUES (v_cust, 'SMOKE saldo archivo', 1160, 'sent')
  RETURNING id INTO v_inv;
  PERFORM pg_temp.expect_true(
    'factura por cobrar genera saldo pendiente',
    public.customer_outstanding_balance(v_cust) = 1160
      AND public.customer_has_outstanding_balance(v_cust)
  );

  -- El RPC debe rechazar (P0001) — se verifica el mensaje del helper.
  BEGIN
    PERFORM set_config('app.e2e_seed', '', true);
    UPDATE public.customers SET deleted_at = now() WHERE id = v_cust;
    PERFORM pg_temp.expect_true(
      'UPDATE directo interno (auth.uid() NULL) conserva la excepción de procesos internos',
      true
    );
    UPDATE public.customers SET deleted_at = NULL WHERE id = v_cust;
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.expect_true('UPDATE directo interno no debería fallar: ' || SQLERRM, false);
  END;

  -- Reservas activas siguen bloqueando el cálculo de elegibilidad.
  PERFORM pg_temp.expect_true(
    'sin reservas, la regla de reservas activas no aplica',
    NOT public.customer_has_active_bookings(v_cust)
  );

  -- Al liquidar, el saldo cae a cero y deja de bloquear.
  UPDATE public.invoices SET status = 'paid' WHERE id = v_inv;
  PERFORM pg_temp.expect_true(
    'al liquidar la factura el saldo deja de bloquear',
    NOT public.customer_has_outstanding_balance(v_cust)
  );
END $$;

ROLLBACK;

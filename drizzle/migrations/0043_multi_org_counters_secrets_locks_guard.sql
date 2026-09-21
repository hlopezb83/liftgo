-- 0043_multi_org_counters_secrets_locks_guard
--
-- Paso 6 del endurecimiento multiempresa. Diez RPC SECURITY DEFINER seguían
-- resolviendo la organización sólo con resolve_organization_context() /
-- current_organization_id() y un rol global, sin exigir membresía interna:
--
--   * count_releasable_payment_locks() delegaba en releasable_payment_locks(),
--     cuyo SELECT recorre public.supplier_bills sin filtro de organización: un
--     administrador de la empresa A obtenía el total global de bloqueos.
--   * get_billing_secrets_status() y los ocho envoltorios de folios podían ser
--     ejecutados por una identidad con rol residual y membresía de portal.
--
-- Reglas aplicadas en las diez:
--   * Se conservan firma, retorno, volatilidad, formato de folio, mínimos,
--     mensajes, reglas de rol funcionales, SECURITY DEFINER y
--     SET search_path = 'public'.
--   * Canal authenticated: v_uid = auth.uid(), v_org =
--     current_internal_organization_id(); se exige v_org no nulo,
--     is_internal_member(v_uid) y que resolve_organization_context() coincida
--     con v_org. Una identidad de portal (membresía no interna) obtiene NULL en
--     current_internal_organization_id() y queda bloqueada.
--   * Canal sin auth.uid() (service_role / procesos internos) se conserva tal
--     como estaba: resolve_organization_context() exige el contexto explícito
--     app.organization_id cuando hay más de una organización activa. Nunca se
--     acepta una organización provista por el cliente.
--   * No se modifican helpers compartidos, portal ni funciones ajenas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. count_releasable_payment_locks
--    Misma definición de "liberable" que releasable_payment_locks(), pero
--    acotada a las facturas de proveedor de la organización de la sesión.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.count_releasable_payment_locks(p_older_than_hours integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_count integer := 0;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RETURN 0;
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.supplier_bills b
   WHERE b.organization_id = v_org
     AND b.payment_in_progress_at IS NOT NULL
     AND b.payment_in_progress_at < now() - make_interval(hours => GREATEST(COALESCE(p_older_than_hours, 24), 1))
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp
            WHERE sp.bill_id = b.id AND sp.batch_id IS NOT NULL
         )
     AND NOT EXISTS (
           SELECT 1
             FROM public.supplier_payment_batch_items i
             JOIN public.supplier_payments sp2 ON sp2.batch_id = i.batch_id
            WHERE i.bill_id = b.id
         );

  RETURN v_count;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_billing_secrets_status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_billing_secrets_status()
 RETURNS TABLE(id uuid, has_test_key boolean, has_live_key boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    bs.id,
    (bs.facturapi_test_key IS NOT NULL AND length(bs.facturapi_test_key) > 0)
      AS has_test_key,
    (bs.facturapi_live_key IS NOT NULL AND length(bs.facturapi_live_key) > 0)
      AS has_live_key
  FROM public.billing_secrets bs
  WHERE bs.organization_id = public.current_internal_organization_id()
    AND public.current_internal_organization_id() IS NOT NULL
    AND public.is_internal_member((select auth.uid()))
    AND (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'administrativo'::public.app_role)
    )
  LIMIT 1;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3-10. Envoltorios de folios: validan la sesión interna antes de consumir o
--       leer el contador de la organización.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_contract_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.is_staff() THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
  END IF;

  RETURN 'CTR-' || lpad(
    public.next_organization_document_counter('contract', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_quote_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.is_staff() THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
  END IF;

  RETURN 'COT-' || lpad(
    public.next_organization_document_counter('quote', 101)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_supplier_bill_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.is_staff() THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
  END IF;

  RETURN 'CXP-' || lpad(
    public.next_organization_document_counter('supplier_bill', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_draft_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN 'BORRADOR-' || lpad(
    public.next_organization_document_counter('draft_invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_draft_credit_note_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN 'BORRADOR-NC-' || lpad(
    public.next_organization_document_counter('draft_credit_note', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN 'BORRADOR-' || lpad(
    public.peek_organization_document_counter('draft_invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_credit_note_number()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN 'BORRADOR-NC-' || lpad(
    public.peek_organization_document_counter('draft_credit_note', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN 'FAC-' || lpad(
    public.peek_organization_document_counter('invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL: sin PUBLIC ni anon; authenticated y service_role conservan EXECUTE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.count_releasable_payment_locks(integer)',
    'public.get_billing_secrets_status()',
    'public.next_contract_number()',
    'public.next_draft_credit_note_number()',
    'public.next_draft_invoice_number()',
    'public.next_quote_number()',
    'public.next_supplier_bill_number()',
    'public.peek_next_draft_credit_note_number()',
    'public.peek_next_draft_invoice_number()',
    'public.peek_next_invoice_number()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.count_releasable_payment_locks(integer) IS
  'Multiempresa 0043: cuenta sólo supplier_bills de current_internal_organization_id(); misma definición de bloqueo liberable que releasable_payment_locks().';
COMMENT ON FUNCTION public.get_billing_secrets_status() IS
  'Multiempresa 0043: lee sólo billing_secrets de la organización interna de la sesión; una identidad de portal no obtiene filas.';
COMMENT ON FUNCTION public.peek_next_invoice_number() IS
  'Multiempresa 0043: valida sesión interna antes de leer el contador de la organización; el canal service_role exige app.organization_id con varias organizaciones activas.';

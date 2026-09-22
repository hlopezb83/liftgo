-- 0044_multi_org_customer_reads_link_rep_guard
--
-- Paso 7 del endurecimiento multiempresa. Cinco RPC SECURITY DEFINER seguían
-- distinguiendo "interno" de "cliente del portal" con roles globales
-- (has_role / is_staff) o resolvían la empresa con current_organization_id():
--
--   * get_customer_profitability / get_customer_summary: una identidad de
--     portal con rol administrativo residual entraba por la rama de staff y
--     podía consultar cualquier customer_id de su empresa.
--   * get_feedback_leaderboard: v_is_customer salía de has_role('customer'),
--     así que un portal con rol residual veía reporter_id y nombres internos.
--   * link_customer_to_organization_by_rfc: exigía current_organization_id()
--     (cualquier membresía) en vez de contexto interno explícito.
--   * assign_stamped_rep_number/3: comparaba el pago contra
--     current_organization_id() en lugar de la organización interna.
--
-- Reglas aplicadas:
--   * El tipo de sesión se calcula por membresía/cuenta real, nunca por rol
--     global: primero current_portal_customer_id(); si es NULL, el canal
--     interno exige current_internal_organization_id() no nulo e
--     is_internal_member(auth.uid()). El rol residual nunca convierte una
--     identidad de portal en staff.
--   * Los roles funcionales actuales se conservan para el canal interno.
--   * Toda lectura/mutación queda acotada a la organización resuelta desde la
--     membresía real (v_org) o desde la fila objetivo.
--   * Se preservan firmas, defaults, retornos, formatos, SECURITY DEFINER y
--     SET search_path = 'public'.
--   * assign_stamped_rep_number conserva el canal sin auth.uid()
--     (service_role / procesos internos) tal como estaba.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_customer_profitability(uuid)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := (SELECT auth.uid());
  v_portal_customer uuid;
  v_org uuid;
  v_is_internal boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- Tipo de sesión por membresía/cuenta real, no por rol global.
  v_portal_customer := public.current_portal_customer_id();
  IF v_portal_customer IS NOT NULL THEN
    SELECT a.organization_id INTO v_org
    FROM public.customer_portal_accounts a
    WHERE a.auth_user_id = v_uid
      AND a.status = 'active'
      AND a.customer_id = v_portal_customer;
  ELSE
    v_org := public.current_internal_organization_id();
    IF v_org IS NOT NULL AND public.is_internal_member(v_uid) THEN
      v_is_internal := true;
    ELSE
      v_org := NULL;
    END IF;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_is_internal THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'administrativo'::public.app_role)
      OR public.has_role(v_uid, 'auditor'::public.app_role)
      OR public.has_role(v_uid, 'ventas'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Canal portal: sólo su propio customer_id.
    IF p_customer_id IS NULL OR p_customer_id IS DISTINCT FROM v_portal_customer THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH revenue AS (
    SELECT COALESCE(SUM(
      COALESCE(public.fx_to_mxn(i.subtotal, i.moneda, i.tipo_cambio), 0)
      - COALESCE((
          SELECT SUM(public.fx_to_mxn(cn.subtotal, i.moneda, i.tipo_cambio))
          FROM public.credit_notes cn
          WHERE cn.invoice_id = i.id
            AND cn.organization_id = v_org
            AND cn.cancellation_status <> 'accepted'
            AND cn.status <> 'cancelled'
            AND cn.cfdi_status = 'stamped'
        ), 0)
    ), 0)::numeric AS r
    FROM public.invoices i
    WHERE i.customer_id = p_customer_id
      AND i.organization_id = v_org
      AND i.status <> 'cancelled'
      AND COALESCE(i.cancellation_status, '') <> 'accepted'
      AND i.is_e2e IS NOT TRUE
  ),
  customer_forklifts AS (
    SELECT DISTINCT b.forklift_id
    FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND b.organization_id = v_org
      AND b.forklift_id IS NOT NULL
  ),
  maint AS (
    SELECT COALESCE(SUM(ml.cost), 0)::numeric AS c
    FROM public.maintenance_logs ml
    WHERE ml.forklift_id IN (SELECT forklift_id FROM customer_forklifts)
      AND ml.organization_id = v_org
      AND ml.deleted_at IS NULL
      AND ml.is_e2e IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'revenue', revenue.r,
    'maintenance_cost', maint.c,
    'gross_margin', revenue.r - maint.c,
    'margin_percent',
      CASE WHEN revenue.r > 0
        THEN ROUND(((revenue.r - maint.c) / revenue.r) * 100, 2)
        ELSE 0
      END
  )
  INTO v_result
  FROM revenue, maint;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_customer_profitability(uuid) IS
  'Rentabilidad por cliente. Canal interno (membresía interna + rol funcional) o canal portal (sólo su propio customer_id). Acotada a la organización resuelta desde la membresía real.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_customer_summary(uuid)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals jsonb;
  v_uid uuid := (SELECT auth.uid());
  v_portal_customer uuid;
  v_org uuid;
  v_is_internal boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_portal_customer := public.current_portal_customer_id();
  IF v_portal_customer IS NOT NULL THEN
    SELECT a.organization_id INTO v_org
    FROM public.customer_portal_accounts a
    WHERE a.auth_user_id = v_uid
      AND a.status = 'active'
      AND a.customer_id = v_portal_customer;
  ELSE
    v_org := public.current_internal_organization_id();
    IF v_org IS NOT NULL AND public.is_internal_member(v_uid) THEN
      v_is_internal := true;
    ELSE
      v_org := NULL;
    END IF;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_is_internal THEN
    IF NOT (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'administrativo'::public.app_role)
      OR public.has_role(v_uid, 'auditor'::public.app_role)
      OR public.has_role(v_uid, 'dispatcher'::public.app_role)
      OR public.has_role(v_uid, 'ventas'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF p_customer_id IS NULL OR p_customer_id IS DISTINCT FROM v_portal_customer THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'booking_number', b.booking_number,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM public.bookings b
  LEFT JOIN public.forklifts f
    ON f.id = b.forklift_id
   AND f.organization_id = v_org
  WHERE b.customer_id = p_customer_id
    AND b.organization_id = v_org;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'issued_at', i.issued_at,
    'due_date', i.due_date,
    'total', i.total,
    'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', i.tipo_cambio,
    'fx_missing', public.fx_is_missing(i.moneda, i.tipo_cambio)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM public.invoices i
  WHERE i.customer_id = p_customer_id
    AND i.organization_id = v_org
    AND i.status NOT IN ('draft', 'cancelled');

  WITH scoped AS (
    SELECT v.*,
           CASE WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN'
                THEN 1::numeric ELSE v.tipo_cambio END AS rate
    FROM public.v_invoices_with_balance v
    JOIN public.invoices i ON i.id = v.id
    WHERE v.customer_id = p_customer_id
      AND i.organization_id = v_org
      AND v.status NOT IN ('draft', 'cancelled')
  ),
  usable AS (
    SELECT * FROM scoped WHERE NOT fx_missing
  )
  SELECT jsonb_build_object(
    'total_invoiced',
      COALESCE((SELECT SUM(ROUND(u.total * u.rate, 2)) FROM usable u), 0),
    'total_paid',
      COALESCE((SELECT SUM(ROUND(u.paid_amount * u.rate, 2)) FROM usable u), 0),
    'total_credited',
      COALESCE((SELECT SUM(ROUND(u.credited_amount * u.rate, 2)) FROM usable u), 0),
    'outstanding_revenue',
      COALESCE((
        SELECT SUM(ROUND(u.balance * u.rate, 2))
        FROM usable u
        WHERE u.status IN ('sent', 'partial', 'overdue')
          AND COALESCE(u.cancellation_status, '') <> 'accepted'
      ), 0),
    'fx_missing_count',
      COALESCE((
        SELECT count(*)
        FROM scoped s
        WHERE s.fx_missing OR COALESCE(s.payments_fx_missing, 0) > 0
      ), 0)
  )
  INTO v_totals;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals', v_totals
  );
END;
$function$;

COMMENT ON FUNCTION public.get_customer_summary(uuid) IS
  'Resumen de cliente. Canal interno (membresía interna + rol funcional) o canal portal (sólo su propio customer_id). Acotado a la organización resuelta desde la membresía real.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_feedback_leaderboard(text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_feedback_leaderboard(_period text DEFAULT 'all'::text)
 RETURNS TABLE(reporter_id uuid, reporter_name text, total_reports bigint, accepted_reports bigint, resolved_reports bigint, total_points bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_is_customer boolean := false;
  v_uid uuid := (SELECT auth.uid());
  v_portal_customer uuid;
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  -- v_is_customer se fija desde la cuenta de portal real; el rol global
  -- residual nunca convierte al portal en personal interno.
  v_portal_customer := public.current_portal_customer_id();
  IF v_portal_customer IS NOT NULL THEN
    v_is_customer := true;
    SELECT a.organization_id INTO v_org
    FROM public.customer_portal_accounts a
    WHERE a.auth_user_id = v_uid
      AND a.status = 'active'
      AND a.customer_id = v_portal_customer;
  ELSE
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      v_org := NULL;
    END IF;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sin contexto de empresa' USING ERRCODE = '42501';
  END IF;

  v_start := CASE _period
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  RETURN QUERY
  SELECT
    CASE WHEN v_is_customer THEN NULL::uuid ELSE fr.reporter_id END AS reporter_id,
    CASE
      WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'Equipo LiftGo'
      ELSE COALESCE(MAX(fr.reporter_name), 'Anónimo')
    END AS reporter_name,
    COUNT(*)::bigint AS total_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('accepted','in_progress','resolved','closed'))::bigint AS accepted_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('resolved','closed'))::bigint AS resolved_reports,
    COALESCE(SUM(fr.points_awarded), 0)::bigint AS total_points
  FROM public.feedback_reports fr
  WHERE fr.created_at >= v_start
    AND fr.organization_id = v_org
  GROUP BY fr.reporter_id, fr.reporter_type, (CASE WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'staff' ELSE 'self' END)
  HAVING COALESCE(SUM(fr.points_awarded), 0) > 0
  ORDER BY total_points DESC, resolved_reports DESC
  LIMIT 50;
END;
$function$;

COMMENT ON FUNCTION public.get_feedback_leaderboard(text) IS
  'Ranking de reportes de la empresa de la sesión. El canal portal se determina por la cuenta de portal real y oculta reporter_id y nombres internos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. link_customer_to_organization_by_rfc(text,text,text,text,text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_customer_to_organization_by_rfc(p_rfc text, p_alias text DEFAULT NULL::text, p_contact_person text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_rfc text := upper(btrim(coalesce(p_rfc, '')));
  v_customer public.customers%ROWTYPE;
  v_status text;
BEGIN
  -- Canal exclusivamente interno.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: se requiere una membresía interna verificada'
      USING ERRCODE = '42501';
  END IF;
  IF public.current_portal_customer_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: se requiere una membresía interna verificada'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'administrativo'::public.app_role)
          OR public.has_role(v_uid, 'ventas'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org AND o.is_active) THEN
    RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
      USING ERRCODE = '42501';
  END IF;
  IF v_rfc = '' OR v_rfc = 'XAXX010101000' THEN
    RAISE EXCEPTION 'Se requiere un RFC identificable para vincular un cliente'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE upper(c.rfc) = v_rfc
    AND c.deleted_at IS NULL
  ORDER BY c.created_at
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT oc.status INTO v_status
  FROM public.organization_customers oc
  WHERE oc.organization_id = v_org AND oc.customer_id = v_customer.id;

  IF v_status IS NOT NULL THEN
    IF v_status = 'archived' THEN
      UPDATE public.organization_customers
      SET status = 'active', updated_at = now()
      WHERE organization_id = v_org AND customer_id = v_customer.id;
    END IF;
    RETURN v_customer.id;
  END IF;

  INSERT INTO public.organization_customers (
    organization_id, customer_id, alias, razon_social, rfc, regimen_fiscal,
    uso_cfdi, domicilio_fiscal_cp, representante_legal, contact_person,
    email, phone, billing_address, tax_rate, status, notes
  )
  VALUES (
    v_org, v_customer.id,
    COALESCE(NULLIF(btrim(p_alias), ''), v_customer.company),
    v_customer.razon_social, v_customer.rfc, v_customer.regimen_fiscal,
    v_customer.uso_cfdi, v_customer.domicilio_fiscal_cp, v_customer.representante_legal,
    COALESCE(NULLIF(btrim(p_contact_person), ''), v_customer.contact_person),
    COALESCE(NULLIF(btrim(p_email), ''), v_customer.email),
    COALESCE(NULLIF(btrim(p_phone), ''), v_customer.phone),
    COALESCE(v_customer.billing_address, v_customer.address), v_customer.tax_rate,
    'active', v_customer.notes
  );

  RETURN v_customer.id;
END;
$function$;

COMMENT ON FUNCTION public.link_customer_to_organization_by_rfc(text,text,text,text,text) IS
  'Vincula un cliente por RFC exclusivamente a la organización interna de la sesión (current_internal_organization_id + is_internal_member).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. assign_stamped_rep_number(uuid,text,uuid)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(p_payment_id uuid, p_folio text, p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_new_number text;
  v_payment_org uuid;
  v_existing text;
  v_found boolean;
  v_rows int;
BEGIN
  -- Autorizacion ANTES de cualquier lectura privilegiada.
  -- v_uid NULL = proceso interno (service_role / cron), igual que el resto de
  -- las funciones fiscales SECURITY DEFINER del proyecto.
  IF v_uid IS NOT NULL THEN
    IF public.current_portal_customer_id() IS NOT NULL THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  SELECT true, organization_id, rep_number
    INTO v_found, v_payment_org, v_existing
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF v_payment_org IS NULL THEN
    RAISE EXCEPTION 'payment % has no organization; cannot assign REP folio',
      p_payment_id USING ERRCODE = '42501';
  END IF;

  -- Aislamiento multiempresa para cualquier caller autenticado: el rol no
  -- basta. Un admin de la organizacion A no puede folear un pago de B, ni
  -- pasando NULL en p_organization_id. Fail-closed ANTES del UPDATE.
  IF v_uid IS NOT NULL AND v_org IS DISTINCT FROM v_payment_org THEN
    RAISE EXCEPTION 'payment % belongs to another organization', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  -- El parametro no manda: se contrasta contra la organizacion del pago.
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_payment_org THEN
    RAISE EXCEPTION 'payment % belongs to another organization', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotencia explicita para recuperacion/reintento.
  IF v_existing IS NOT NULL THEN
    IF v_existing = v_new_number THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION
      'rep_number % already assigned to payment % (requested %)',
      v_existing, p_payment_id, v_new_number
      USING ERRCODE = 'unique_violation';
  END IF;

  BEGIN
    UPDATE public.payments
       SET rep_number = v_new_number,
           rep_folio = p_folio
     WHERE id = p_payment_id
       AND organization_id = v_payment_org;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment % not found in its organization', p_payment_id
        USING ERRCODE = 'P0002';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'rep_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid,text,uuid) IS
  'Asigna el folio REP del pago. Canal authenticated: organización interna verificada igual a payments.organization_id; p_organization_id sólo se contrasta. Canal sin auth.uid() (service_role) sin cambios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL: PUBLIC y anon sin EXECUTE; se conserva el uso actual.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_customer_profitability(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_feedback_leaderboard(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_customer_to_organization_by_rfc(text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid,text,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_customer_profitability(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_feedback_leaderboard(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_customer_to_organization_by_rfc(text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid,text,uuid) TO authenticated, service_role;

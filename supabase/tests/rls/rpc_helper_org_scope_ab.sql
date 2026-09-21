-- Multiempresa · paso 3: las RPC y helpers endurecidos por 0039 no cruzan de
-- empresa. Dos organizaciones reales (A y B), dos sesiones JWT distintas.
--
--   a) Las seis funciones SECURITY INVOKER no ven datos de B desde A aunque
--      reciban explícitamente los UUID de B.
--   b) get_feedback_leaderboard de A no agrega los reportes de B.
--   c) get_customer_id_for_user de A no acepta el UUID de un usuario de B.
--   d) current_portal_customer_id queda ligado a usuario + organización.
--   e) is_internal_member no revela a los miembros de B.
BEGIN;

-- ── 0. Alta de las dos empresas y sus actores ────────────────────────
DO $$
DECLARE
  v_org_a uuid := '39000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '39000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '39000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '39000000-0000-4000-8000-0000000000b1';
  v_portal_b uuid := '39000000-0000-4000-8000-0000000000b2';
  v_cust_b uuid := '39000000-0000-4000-8000-0000000000bc';
  v_fork_b uuid := '39000000-0000-4000-8000-0000000000bf';
  v_book_b uuid := '39000000-0000-4000-8000-0000000000bb';
  v_inv_b uuid := '39000000-0000-4000-8000-0000000000b9';
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.has_open_rental(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'RPC ORG 0039: la cadena Drizzle 0039 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas del Norte', 'rpc-ab-a'),
    (v_org_b, 'Elevación Industrial del Bajío', 'rpc-ab-b');

  -- Empresa A: un administrador interno.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'ana.reyes@montacargasnorte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Empresa B: administrador interno, cliente y cuenta de portal.
  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'bruno.salas@elevacionbajio.test', now(), now());
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_portal_b, 'compras@clientebajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal'), (v_org_b, v_portal_b, 'portal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_portal_b, 'customer'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name)
  VALUES (v_cust_b, 'Aceros del Bajío SA de CV');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, v_cust_b);
  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email, status)
  VALUES (v_org_b, v_cust_b, v_portal_b, 'compras@clientebajio.test', 'active');

  -- Operación de B: montacargas rentado con entrega completada y factura
  -- con pago aplicado.
  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  -- Estado inicial 'available': guard_forklift_status_insert prohíbe crear
  -- directamente en 'rented'; la entrega completada de abajo avanza el flujo.
  VALUES (v_fork_b, 'MC-B-01', 'Toyota 8FGU25', 'available', v_org_b);

  INSERT INTO public.bookings
    (id, forklift_id, customer_id, start_date, end_date, booking_number, status, organization_id)
  VALUES (
    v_book_b, v_fork_b, v_cust_b,
    public.today_mty() - 5, public.today_mty() + 15,
    'RES-B-0001', 'confirmed', v_org_b
  );

  -- enforce_delivery_completed_evidence exige operador, firma o justificación.
  INSERT INTO public.deliveries
    (forklift_id, booking_id, scheduled_date, delivery_number, type, status,
     completed_no_evidence_reason, organization_id)
  VALUES (
    v_fork_b, v_book_b, public.today_mty() - 5, 'ENT-B-0001', 'delivery', 'completed',
    'Entrega de prueba autorizada por coordinación operativa', v_org_b
  );

  -- validate_invoice_totals y validate_invoice_line_items_signs exigen
  -- partidas coherentes con subtotal + impuestos = total.
  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES (
    v_inv_b, 'FAC-B-0001', v_cust_b, 'sent',
    '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
    10000, 1600, 11600, v_org_b
  );

  INSERT INTO public.payments (invoice_id, amount, organization_id)
  VALUES (v_inv_b, 1160, v_org_b);

  -- Reportes de mejora con puntos en ambas empresas. El de B se atribuye al
  -- administrador de A para probar que ni siquiera sus propios puntos cruzan.
  INSERT INTO public.feedback_reports
    (reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES (
    v_admin_a, 'staff', 'Ana Reyes', 'bug', 'Reporte en B', 'Creado en la empresa B',
    'resolved', 7, v_org_b
  );

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.feedback_reports
    (reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES (
    v_admin_a, 'staff', 'Ana Reyes', 'bug', 'Reporte en A', 'Creado en la empresa A',
    'resolved', 5, v_org_a
  );
END;
$$;

-- ── 1. Sesión del administrador de A ─────────────────────────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"39000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_org_b uuid := '39000000-0000-4000-8000-0000000000b0';
  v_admin_b uuid := '39000000-0000-4000-8000-0000000000b1';
  v_portal_b uuid := '39000000-0000-4000-8000-0000000000b2';
  v_fork_b uuid := '39000000-0000-4000-8000-0000000000bf';
  v_inv_b uuid := '39000000-0000-4000-8000-0000000000b9';
  v_fallas text[] := '{}';
  v_texto text;
  v_bool boolean;
  v_num bigint;
BEGIN
  -- a) Las seis funciones INVOKER, con UUID de B en la mano.
  IF public.has_active_rental(v_fork_b) THEN
    v_fallas := v_fallas || 'has_active_rental: A vio la reserva activa de B';
  END IF;

  IF public.has_open_rental(v_fork_b) THEN
    v_fallas := v_fallas || 'has_open_rental: A vio la renta abierta de B';
  END IF;

  v_texto := public.damage_restore_forklift_status(v_fork_b, 'rented');
  IF v_texto IS DISTINCT FROM 'available' THEN
    v_fallas := v_fallas ||
      format('damage_restore_forklift_status: A dedujo "%s" con datos de B', v_texto);
  END IF;

  v_texto := public.assert_invoice_cancellable(v_inv_b);
  IF v_texto IS NOT NULL THEN
    v_fallas := v_fallas || 'assert_invoice_cancellable: A leyó los pagos de B';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.audit_fleet_status_consistency() a
    WHERE a.forklift_id = v_fork_b
  ) THEN
    v_fallas := v_fallas || 'audit_fleet_status_consistency: A auditó la flota de B';
  END IF;

  v_num := public.get_my_feedback_points_total();
  IF v_num <> 5 THEN
    v_fallas := v_fallas ||
      format('get_my_feedback_points_total: A sumó %s puntos (esperado 5, sin los 7 de B)', v_num);
  END IF;

  -- b) Leaderboard acotado a la empresa del invocante.
  SELECT coalesce(sum(l.total_points), 0) INTO v_num
  FROM public.get_feedback_leaderboard('all') l;
  IF v_num <> 5 THEN
    v_fallas := v_fallas ||
      format('get_feedback_leaderboard: A agregó %s puntos (esperado 5)', v_num);
  END IF;

  -- c) No resuelve clientes de usuarios ajenos.
  IF public.get_customer_id_for_user(v_portal_b) IS NOT NULL THEN
    v_fallas := v_fallas || 'get_customer_id_for_user: A resolvió el cliente de un usuario de B';
  END IF;
  IF public.get_customer_id_for_user((SELECT auth.uid())) IS NOT NULL THEN
    v_fallas := v_fallas || 'get_customer_id_for_user: el staff de A recibió un cliente de portal';
  END IF;

  -- d) El helper del portal no aplica a personal interno.
  IF public.current_portal_customer_id() IS NOT NULL THEN
    v_fallas := v_fallas || 'current_portal_customer_id: el staff de A obtuvo un cliente de portal';
  END IF;

  -- e) is_internal_member no es oráculo de membresías ajenas.
  v_bool := public.is_internal_member(v_admin_b);
  IF v_bool THEN
    v_fallas := v_fallas || 'is_internal_member: A confirmó la membresía interna de B';
  END IF;
  IF NOT public.is_internal_member() THEN
    v_fallas := v_fallas || 'is_internal_member: A dejó de reconocer su propia membresía';
  END IF;
  IF public.is_internal_member(v_portal_b) THEN
    v_fallas := v_fallas || 'is_internal_member: A confirmó un usuario de portal de B';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0039: fugas desde la empresa A:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: desde A ninguna RPC/helper leyó datos de B';
END;
$$;

RESET ROLE;
RESET request.jwt.claims;

-- ── 2. Sesión del administrador de B: su operación sigue funcionando ─
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"39000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

DO $$
DECLARE
  v_fork_b uuid := '39000000-0000-4000-8000-0000000000bf';
  v_inv_b uuid := '39000000-0000-4000-8000-0000000000b9';
  v_fallas text[] := '{}';
  v_num bigint;
BEGIN
  IF NOT public.has_active_rental(v_fork_b) THEN
    v_fallas := v_fallas || 'has_active_rental: B dejó de ver su propia reserva';
  END IF;
  IF NOT public.has_open_rental(v_fork_b) THEN
    v_fallas := v_fallas || 'has_open_rental: B dejó de ver su propia renta abierta';
  END IF;
  IF public.damage_restore_forklift_status(v_fork_b, 'rented') IS DISTINCT FROM 'rented' THEN
    v_fallas := v_fallas || 'damage_restore_forklift_status: B perdió su propio estado rentado';
  END IF;
  IF public.assert_invoice_cancellable(v_inv_b) IS NULL THEN
    v_fallas := v_fallas || 'assert_invoice_cancellable: B dejó de ver su propio pago aplicado';
  END IF;

  SELECT coalesce(sum(l.total_points), 0) INTO v_num
  FROM public.get_feedback_leaderboard('all') l;
  IF v_num <> 7 THEN
    v_fallas := v_fallas ||
      format('get_feedback_leaderboard: B agregó %s puntos (esperado 7)', v_num);
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0039: la empresa B perdió acceso a lo suyo:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: la empresa B conserva su propia operación';
END;
$$;

RESET ROLE;
RESET request.jwt.claims;

-- ── 3. Sesión del cliente del portal de B ────────────────────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"39000000-0000-4000-8000-0000000000b2","role":"authenticated"}';

DO $$
DECLARE
  v_cust_b uuid := '39000000-0000-4000-8000-0000000000bc';
  v_admin_b uuid := '39000000-0000-4000-8000-0000000000b1';
  v_fallas text[] := '{}';
BEGIN
  IF public.current_portal_customer_id() IS DISTINCT FROM v_cust_b THEN
    v_fallas := v_fallas || 'current_portal_customer_id: el portal de B no resolvió su cliente';
  END IF;
  IF public.get_customer_id_for_user((SELECT auth.uid())) IS DISTINCT FROM v_cust_b THEN
    v_fallas := v_fallas || 'get_customer_id_for_user: el portal de B no resolvió su cliente';
  END IF;
  IF public.get_customer_id_for_user(v_admin_b) IS NOT NULL THEN
    v_fallas := v_fallas || 'get_customer_id_for_user: el portal consultó un UUID ajeno';
  END IF;
  IF public.is_internal_member() THEN
    v_fallas := v_fallas || 'is_internal_member: una cuenta de portal se declaró interna';
  END IF;
  IF public.is_internal_member(v_admin_b) THEN
    v_fallas := v_fallas || 'is_internal_member: el portal consultó la membresía del staff';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0039: el portal de B quedó mal acotado:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: el portal de B queda ligado a su usuario y su empresa';
END;
$$;

RESET ROLE;
RESET request.jwt.claims;

ROLLBACK;

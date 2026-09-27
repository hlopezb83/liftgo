-- Sólo CI con BD aislada. Las lecturas se ejecutan como authenticated con RLS.
-- El setup incluye estados históricos que los guardas actuales ya impiden;
-- desactiva sus triggers sólo durante el setup y restaura origin antes de leer.
-- ROLLBACK evita persistir incluso las filas y funciones temporales.
BEGIN;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE utilization_cases (
  case_id integer, name text, expected integer, start_offset integer,
  end_offset integer, delivered_offset integer, returned_offset integer,
  booking_status text DEFAULT 'completed', e2e boolean DEFAULT false,
  pickup boolean DEFAULT false, legacy_delivery boolean DEFAULT false
);
INSERT INTO utilization_cases
  (case_id, name, expected, start_offset, end_offset, delivered_offset, returned_offset) VALUES
  (1, 'entrega y devolución anticipada en el mismo día', 1, -1, 7, -1, -1),
  (2, 'entrega tardía', 3, -10, 5, -3, -1),
  (3, 'reserva sin entrega completada', 0, -8, 7, NULL, NULL),
  (4, 'equipo no devuelto tras vencer la reserva', 6, -6, -2, -5, NULL),
  (5, 'fechas superpuestas cuentan una sola vez', 4, -6, 5, -4, -2),
  (6, 'cierre histórico sin evento de devolución', 3, -6, -3, -5, NULL),
  (7, 'reservas E2E no cuentan', 0, -12, 5, -10, -8),
  (8, 'reservas canceladas no cuentan', 0, -12, 5, -10, -8),
  (9, 'recolección completada detiene el conteo', 2, -4, 5, -3, -2),
  (10, 'alta en UTC y ocupación usan Monterrey', 1, -1, 7, -1, -1),
  (11, 'entrega futura no cuenta todavía', 0, 2, 7, 2, NULL),
  (12, 'retorno anterior a entrega no suma días', 0, -5, 7, -1, -2),
  (13, 'entrega completada histórica sin timestamp', 3, -4, 7, -3, -1),
  (14, 'fecha real prevalece sobre programación', 1, -3, 7, 0, NULL);
UPDATE utilization_cases SET booking_status = 'confirmed' WHERE case_id IN (3,4,11,14);
UPDATE utilization_cases SET e2e = true WHERE case_id = 7;
UPDATE utilization_cases SET booking_status = 'cancelled' WHERE case_id = 8;
UPDATE utilization_cases SET pickup = true WHERE case_id = 9;
UPDATE utilization_cases SET legacy_delivery = true WHERE case_id = 13;

DO $setup$
DECLARE
  v_org_a uuid := '71000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '71000000-0000-4000-8000-0000000000b0';
  v_admin uuid := '71000000-0000-4000-8000-0000000000a1';
  v_auditor uuid := '71000000-0000-4000-8000-0000000000a2';
  v_mechanic uuid := '71000000-0000-4000-8000-0000000000a3';
  v_today date := public.today_mty();
  v_forklift uuid;
  v_booking uuid;
  v_case record;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Ocupación A', 'utilization-0071-a'),
    (v_org_b, 'Ocupación B', 'utilization-0071-b');
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin, 'admin.utilization@rls.test', now(), now()),
    (v_auditor, 'auditor.utilization@rls.test', now(), now()),
    (v_mechanic, 'mechanic.utilization@rls.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_org_a, v_admin, 'internal'), (v_org_a, v_auditor, 'internal'),
    (v_org_a, v_mechanic, 'internal');
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin, 'admin'), (v_auditor, 'auditor'), (v_mechanic, 'mechanic');

  FOR v_case IN SELECT * FROM utilization_cases LOOP
    v_forklift := ('71000000-0000-4000-8000-' || lpad(v_case.case_id::text,12,'0'))::uuid;
    v_booking := ('71000000-0000-4000-8000-' || lpad((100+v_case.case_id)::text,12,'0'))::uuid;
    INSERT INTO public.forklifts (id, name, model, status, acquisition_date, acquisition_cost, created_at, organization_id)
    VALUES (v_forklift, 'MC-' || v_case.case_id, 'Toyota 8FGU25', 'available',
      CASE WHEN v_case.case_id = 10 THEN NULL ELSE v_today-20 END, 10000,
      v_today::timestamp AT TIME ZONE 'UTC', v_org_a);
    INSERT INTO public.bookings (id, booking_number, forklift_id, customer_name, start_date, end_date, status, return_status, is_e2e, organization_id)
    VALUES (v_booking, 'RSV-0071-' || v_case.case_id, v_forklift, 'Logística Norte',
      v_today+v_case.start_offset, v_today+v_case.end_offset, v_case.booking_status,
      CASE WHEN v_case.booking_status = 'completed' THEN 'returned' ELSE 'pending' END,
      v_case.e2e, v_org_a);
    INSERT INTO public.deliveries (booking_id, forklift_id, delivery_number, type, status, scheduled_date, completed_at, completed_no_evidence_reason, organization_id)
    VALUES (v_booking, v_forklift, 'ENT-0071-' || v_case.case_id, 'delivery',
      CASE WHEN v_case.delivered_offset IS NULL THEN 'scheduled' ELSE 'completed' END,
      v_today + COALESCE(v_case.delivered_offset,0) - CASE WHEN v_case.case_id=14 THEN 1 ELSE 0 END,
      CASE WHEN NOT v_case.legacy_delivery THEN
        (v_today + v_case.delivered_offset + time '20:00') AT TIME ZONE 'America/Monterrey' END,
      'Historial para regresión de métricas', v_org_a);
    IF v_case.returned_offset IS NOT NULL THEN
      IF v_case.pickup THEN
        INSERT INTO public.deliveries (booking_id, forklift_id, delivery_number, type, status, scheduled_date, completed_at, completed_no_evidence_reason, organization_id)
        VALUES (v_booking, v_forklift, 'REC-0071-' || v_case.case_id, 'pickup', 'completed',
          v_today+v_case.returned_offset,
          (v_today+v_case.returned_offset + time '20:00') AT TIME ZONE 'America/Monterrey',
          'Historial para regresión de métricas', v_org_a);
      ELSE
        INSERT INTO public.return_inspections (booking_id, forklift_id, inspection_number, inspected_at, organization_id)
        VALUES (v_booking, v_forklift, 'DEV-0071-' || v_case.case_id,
          (v_today+v_case.returned_offset + time '20:05') AT TIME ZONE 'America/Monterrey', v_org_a);
      END IF;
    END IF;
  END LOOP;

  -- Segundo intervalo de la misma unidad: unión de cuatro días, no seis.
  INSERT INTO public.bookings (id, booking_number, forklift_id, customer_name, start_date, end_date, status, return_status, organization_id)
  VALUES ('71000000-0000-4000-8000-000000000155', 'RSV-0071-OVERLAP',
    '71000000-0000-4000-8000-000000000005', 'Logística Norte', v_today-5, v_today+7, 'completed', 'returned', v_org_a);
  INSERT INTO public.deliveries (booking_id, forklift_id, delivery_number, type, status, scheduled_date, completed_at, completed_no_evidence_reason, organization_id)
  VALUES ('71000000-0000-4000-8000-000000000155', '71000000-0000-4000-8000-000000000005',
    'ENT-0071-OVERLAP', 'delivery', 'completed', v_today-3,
    (v_today-3 + time '20:00') AT TIME ZONE 'America/Monterrey', 'Historial de métricas', v_org_a);
  INSERT INTO public.return_inspections (booking_id, forklift_id, inspection_number, inspected_at, organization_id)
  VALUES ('71000000-0000-4000-8000-000000000155', '71000000-0000-4000-8000-000000000005',
    'DEV-0071-OVERLAP', (v_today-1 + time '20:05') AT TIME ZONE 'America/Monterrey', v_org_a);

  -- Costos e historial se conservan; sólo cambia la ocupación.
  INSERT INTO public.maintenance_logs (forklift_id, service_type, cost, organization_id)
  VALUES ('71000000-0000-4000-8000-000000000001', 'preventivo', 250, v_org_a);
  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.forklifts (id, name, model, status, acquisition_date, acquisition_cost, organization_id)
  VALUES ('71000000-0000-4000-8000-0000000000bf', 'MC-B', 'Toyota 8FGU25', 'available', v_today-20, 90000, v_org_b);
  INSERT INTO public.bookings (id, booking_number, forklift_id, start_date, end_date, status, organization_id)
  VALUES ('71000000-0000-4000-8000-0000000000bb', 'RSV-0071-B',
    '71000000-0000-4000-8000-0000000000bf', v_today-10, v_today+10, 'confirmed', v_org_b);
  INSERT INTO public.deliveries (booking_id, forklift_id, delivery_number, type, status, scheduled_date, completed_at, completed_no_evidence_reason, organization_id)
  VALUES ('71000000-0000-4000-8000-0000000000bb', '71000000-0000-4000-8000-0000000000bf',
    'ENT-0071-B', 'delivery', 'completed', v_today-10,
    (v_today-10 + time '20:00') AT TIME ZONE 'America/Monterrey', 'Historial de métricas', v_org_b);
END $setup$;

SET LOCAL session_replication_role = origin;
GRANT SELECT ON utilization_cases TO authenticated;
SET LOCAL timezone = 'Asia/Tokyo';
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $assert$
DECLARE
  v_case record;
  v_result jsonb;
BEGIN
  FOR v_case IN SELECT * FROM utilization_cases LOOP
    v_result := public.get_forklift_financials(('71000000-0000-4000-8000-' || lpad(v_case.case_id::text,12,'0'))::uuid);
    IF (v_result->>'days_rented')::int IS DISTINCT FROM v_case.expected THEN
      RAISE EXCEPTION 'Ocupación: % esperaba %, obtuvo %', v_case.name, v_case.expected, v_result;
    END IF;
  END LOOP;
  v_result := public.get_forklift_financials('71000000-0000-4000-8000-000000000010');
  IF (v_result->>'days_since_acquired')::int <> 2 OR (v_result->>'utilization_percent')::numeric <> 50 THEN
    RAISE EXCEPTION 'El denominador debe usar el día de Monterrey: %', v_result;
  END IF;
  v_result := public.get_forklift_financials('71000000-0000-4000-8000-000000000001');
  IF (v_result->>'maintenance_cost')::numeric <> 250
     OR (v_result->>'acquisition_cost')::numeric <> 10000
     OR (v_result->>'gross_margin')::numeric <> -250
     OR (v_result->>'roi_percent')::numeric <> -2.5 THEN
    RAISE EXCEPTION 'Cambiar ocupación alteró costos o rentabilidad: %', v_result;
  END IF;
  IF (SELECT end_date FROM public.bookings WHERE id='71000000-0000-4000-8000-000000000101') <> public.today_mty()+7 THEN
    RAISE EXCEPTION 'La lectura alteró el periodo reservado';
  END IF;
  v_result := public.get_forklift_financials('71000000-0000-4000-8000-0000000000bf');
  IF (v_result->>'days_rented')::int <> 0 OR (v_result->>'acquisition_cost') IS NOT NULL THEN
    RAISE EXCEPTION 'BREACH: métricas o costos de empresa B visibles desde A: %', v_result;
  END IF;
END $assert$;

-- Auditor conserva lectura; mecánico conserva denegación del RPC.
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $auditor$
BEGIN
  IF (public.get_forklift_financials('71000000-0000-4000-8000-000000000001')->>'days_rented')::int <> 1 THEN
    RAISE EXCEPTION 'Auditor no recibió la métrica correcta';
  END IF;
END $auditor$;
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
DO $mechanic$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_forklift_financials('71000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Forbidden' THEN RAISE; END IF;
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BREACH: mecánico accede al RPC financiero'; END IF;
END $mechanic$;

ROLLBACK;

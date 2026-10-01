-- 0082: atomic repair costs, closed header/children, dates, role and org isolation.
BEGIN;

DO $setup$
DECLARE
  v_a uuid := '82000000-0000-4000-8000-0000000000a0';
  v_b uuid := '82000000-0000-4000-8000-0000000000b0';
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_a, 'Taller Norte', 'maintenance-integrity-a'),
    (v_b, 'Taller Bajío', 'maintenance-integrity-b');
  PERFORM set_config('app.organization_id', v_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    ('82000000-0000-4000-8000-0000000000a1', 'maintenance.admin.a@example.com', now(), now()),
    ('82000000-0000-4000-8000-0000000000a2', 'maintenance.mechanic.a@example.com', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_a, '82000000-0000-4000-8000-0000000000a1', 'internal'),
    (v_a, '82000000-0000-4000-8000-0000000000a2', 'internal');
  INSERT INTO public.user_roles (user_id, role) VALUES
    ('82000000-0000-4000-8000-0000000000a1', 'admin'),
    ('82000000-0000-4000-8000-0000000000a2', 'mechanic')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.forklifts (id, name, model, organization_id) VALUES
    ('82000000-0000-4000-8000-00000000fa01', 'MTY-COST-01', 'Toyota 8FG25', v_a);
  INSERT INTO public.mechanics (id, name, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000a3', 'Luis Treviño Cost Integrity', v_a);
  INSERT INTO public.maintenance_logs
    (id, forklift_id, service_type, work_status, manual_cost, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000a4', '82000000-0000-4000-8000-00000000fa01', 'repair-zero', 'in_progress', 100, v_a),
    ('82000000-0000-4000-8000-0000000000a5', '82000000-0000-4000-8000-00000000fa01', 'repair-legacy', 'in_progress', 200, v_a),
    ('82000000-0000-4000-8000-0000000000a6', '82000000-0000-4000-8000-00000000fa01', 'repair-billed', 'in_progress', 300, v_a);
  INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000a7', 'Aceros Industriales del Norte', v_a);
  INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
    (v_a, '82000000-0000-4000-8000-0000000000a7');
  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000a8', 'COST-0082', '82000000-0000-4000-8000-0000000000a7',
     'draft', '[]', 900, 144, 1044, v_a);
  INSERT INTO public.damage_records
    (id, forklift_id, description, estimated_cost, status, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000d1', '82000000-0000-4000-8000-00000000fa01', 'Pulido de panel', 650, 'reported', v_a);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, actual_cost, maintenance_log_id, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000d2', '82000000-0000-4000-8000-00000000fa01', 'Reparación sin cargo interno',
     'repaired', now(), 0, '82000000-0000-4000-8000-0000000000a4', v_a),
    ('82000000-0000-4000-8000-0000000000d3', '82000000-0000-4000-8000-00000000fa01', 'Valoración histórica',
     'repaired', now(), 900, '82000000-0000-4000-8000-0000000000a5', v_a);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, actual_cost, maintenance_log_id, customer_id, invoice_id, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000d4', '82000000-0000-4000-8000-00000000fa01', 'Reparación facturada',
     'invoiced', now(), 900, '82000000-0000-4000-8000-0000000000a6',
     '82000000-0000-4000-8000-0000000000a7', '82000000-0000-4000-8000-0000000000a8', v_a);
  PERFORM set_config('app.organization_id', v_b::text, true);
  INSERT INTO public.forklifts (id, name, model, organization_id) VALUES
    ('82000000-0000-4000-8000-00000000fb01', 'BJX-COST-01', 'Hyster H50FT', v_b);
  INSERT INTO public.maintenance_logs
    (id, forklift_id, service_type, work_status, manual_cost, organization_id) VALUES
    ('82000000-0000-4000-8000-0000000000b4', '82000000-0000-4000-8000-00000000fb01', 'repair-b', 'in_progress', 800, v_b);
  PERFORM set_config('app.organization_id', v_a::text, true);
END $setup$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
-- An explicitly saved zero is distinguishable from the default historical zero.
UPDATE public.damage_records SET actual_cost = 0 WHERE id = '82000000-0000-4000-8000-0000000000d2';

SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $mechanic$
DECLARE v_log uuid; v_labor uuid; v_open_labor uuid; v_blocked boolean;
BEGIN
  v_log := public.start_repair_work_order('82000000-0000-4000-8000-0000000000d1', 'Reparación', NULL, 650);
  PERFORM set_config('test.maintenance_main', v_log::text, true);
  IF (SELECT manual_cost FROM public.maintenance_logs WHERE id = v_log) <> 0 THEN
    RAISE EXCEPTION 'FR-01: presupuesto convertido en gasto manual';
  END IF;
  INSERT INTO public.maintenance_labor (maintenance_log_id, mechanic_id, hours, hourly_rate)
    VALUES (v_log, '82000000-0000-4000-8000-0000000000a3', 2, 325) RETURNING id INTO v_labor;
  PERFORM set_config('test.maintenance_labor', v_labor::text, true);
  UPDATE public.damage_records SET status = 'repaired', repaired_at = now()
    WHERE id = '82000000-0000-4000-8000-0000000000d1';
  UPDATE public.maintenance_logs SET work_status = 'completed', performed_at = public.today_mty()
    WHERE id = v_log;
  IF (SELECT cost FROM public.maintenance_logs WHERE id = v_log) <> 650 THEN
    RAISE EXCEPTION 'FR-01: costo final no coincide con 2h x 325';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.damage_records
      WHERE id = '82000000-0000-4000-8000-0000000000d1' AND actual_cost = 650
        AND estimated_cost = 650 AND actual_cost_source = 'maintenance' AND actual_cost_recorded_at IS NOT NULL) THEN
    RAISE EXCEPTION 'MI-02: cerrar como mecánico no registró costo interno real';
  END IF;
  IF (SELECT status FROM public.forklifts WHERE id = '82000000-0000-4000-8000-00000000fa01') <> 'maintenance' THEN
    RAISE EXCEPTION 'Se liberó la unidad con otras órdenes abiertas';
  END IF;

  v_blocked := false;
  BEGIN UPDATE public.maintenance_logs SET manual_cost = 999, description = 'Edición cerrada' WHERE id = v_log;
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'H-01: cabecera/costo de OT cerrada editable'; END IF;
  v_blocked := false;
  BEGIN UPDATE public.maintenance_labor SET maintenance_log_id = '82000000-0000-4000-8000-0000000000a4' WHERE id = v_labor;
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'H-01: traslado extrajo MO de OT cerrada'; END IF;
  INSERT INTO public.maintenance_labor (maintenance_log_id, mechanic_id, hours, hourly_rate)
    VALUES ('82000000-0000-4000-8000-0000000000a4', '82000000-0000-4000-8000-0000000000a3', 1, 100)
    RETURNING id INTO v_open_labor;
  v_blocked := false;
  BEGIN UPDATE public.maintenance_labor SET maintenance_log_id = v_log WHERE id = v_open_labor;
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'H-01: traslado introdujo MO en OT cerrada'; END IF;
  DELETE FROM public.maintenance_labor WHERE id = v_open_labor;
  v_blocked := false;
  BEGIN DELETE FROM public.maintenance_labor WHERE id = v_labor;
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'H-01: eliminación de MO cerrada permitida'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.reopen_work_order(v_log, 'Cambiar valoración');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Mecánico pudo reabrir OT'; END IF;

  v_blocked := false;
  BEGIN UPDATE public.maintenance_logs SET work_status = 'completed', performed_at = public.today_mty() + 1
    WHERE id = '82000000-0000-4000-8000-0000000000a4';
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'MI-01: cierre futuro permitido'; END IF;
  UPDATE public.maintenance_logs SET work_status = 'completed', performed_at = public.today_mty()
    WHERE id IN ('82000000-0000-4000-8000-0000000000a4', '82000000-0000-4000-8000-0000000000a5', '82000000-0000-4000-8000-0000000000a6');
  IF NOT EXISTS (SELECT 1 FROM public.damage_records
      WHERE id = '82000000-0000-4000-8000-0000000000d2' AND actual_cost = 0 AND actual_cost_source = 'manual') THEN
    RAISE EXCEPTION 'MI-02: sobreescribió valoración explícita de cero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.damage_records
      WHERE id = '82000000-0000-4000-8000-0000000000d3' AND actual_cost = 900 AND actual_cost_source IS NULL) THEN
    RAISE EXCEPTION 'MI-02: sobreescribió valoración positiva histórica';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.damage_records
      WHERE id = '82000000-0000-4000-8000-0000000000d4' AND actual_cost = 900 AND status = 'invoiced') THEN
    RAISE EXCEPTION 'MI-02: alteró costo de daño facturado';
  END IF;
  IF (SELECT status FROM public.forklifts WHERE id = '82000000-0000-4000-8000-00000000fa01') <> 'available' THEN
    RAISE EXCEPTION 'No liberó unidad tras la última reparación';
  END IF;
END $mechanic$;

SET LOCAL request.jwt.claims = '{"sub":"82000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $admin$
DECLARE v_log uuid := current_setting('test.maintenance_main')::uuid; v_blocked boolean; v_rows int;
BEGIN
  -- A cannot update or reopen B through a guessed ID.
  UPDATE public.maintenance_logs SET description = 'Cross-org' WHERE id = '82000000-0000-4000-8000-0000000000b4';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'RLS: A modificó OT de B'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.reopen_work_order('82000000-0000-4000-8000-0000000000b4', 'Cross-org');
  EXCEPTION WHEN OTHERS THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'RPC: A reabrió OT de B'; END IF;
  v_blocked := false;
  BEGIN UPDATE public.damage_records SET actual_cost = 300 WHERE id = '82000000-0000-4000-8000-0000000000d4';
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Se modificó costo ya facturado'; END IF;

  PERFORM public.soft_delete_maintenance_log(v_log);
  PERFORM public.restore_maintenance_log(v_log);
  IF (SELECT COUNT(*) FROM public.maintenance_labor WHERE maintenance_log_id = v_log) <> 1 THEN
    RAISE EXCEPTION 'Archivo/restauración perdió MO';
  END IF;
  PERFORM public.reopen_work_order(v_log, 'Gasto adicional documentado');
  UPDATE public.maintenance_logs SET manual_cost = 200 WHERE id = v_log;
  UPDATE public.maintenance_logs SET work_status = 'completed', performed_at = public.today_mty() WHERE id = v_log;
  IF (SELECT actual_cost FROM public.damage_records WHERE id = '82000000-0000-4000-8000-0000000000d1') <> 850 THEN
    RAISE EXCEPTION 'MI-02: reapertura autorizada no recalculó gasto real sin duplicar presupuesto';
  END IF;
END $admin$;

RESET ROLE;
DO $verify_b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_logs
      WHERE id = '82000000-0000-4000-8000-0000000000b4' AND work_status = 'in_progress' AND description IS NULL) THEN
    RAISE EXCEPTION 'B cambió desde sesión A';
  END IF;
END $verify_b$;
ROLLBACK;

-- A4-01 / A4-02 / A4-03 / A2-5: excluir registros archivados de reportes y
-- restringir notas de credito a las timbradas y no canceladas ante el SAT.
DO $mig$
DECLARE
  d text;
  o text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_income_statement';
  IF d IS NULL THEN RAISE EXCEPTION 'get_income_statement no existe'; END IF;
  o := d;
  d := replace(d,
    E'    FROM maintenance_logs\n    WHERE performed_at BETWEEN p_start_date AND p_end_date\n      AND work_status = ''completed''',
    E'    FROM maintenance_logs\n    WHERE performed_at BETWEEN p_start_date AND p_end_date\n      AND work_status = ''completed''\n      AND deleted_at IS NULL');
  d := replace(d,
    E'    FROM damage_records\n    WHERE COALESCE(repaired_at, created_at)::date BETWEEN p_start_date AND p_end_date',
    E'    FROM damage_records\n    WHERE COALESCE(repaired_at, created_at)::date BETWEEN p_start_date AND p_end_date\n      AND deleted_at IS NULL');
  d := replace(d,
    E'    WHERE cn.status NOT IN (''draft'',''cancelled'')\n      AND cn.issued_at BETWEEN p_start_date AND p_end_date',
    E'    WHERE cn.status NOT IN (''draft'',''cancelled'')\n      AND cn.cfdi_status = ''stamped''\n      AND cn.cancellation_status IS DISTINCT FROM ''accepted''\n      AND cn.issued_at BETWEEN p_start_date AND p_end_date');
  IF d = o THEN RAISE EXCEPTION 'get_income_statement: ningun patron aplicado'; END IF;
  IF position('AND deleted_at IS NULL' in d) = 0
     OR position('AND cn.cfdi_status = ''stamped''' in d) = 0 THEN
    RAISE EXCEPTION 'get_income_statement: parches incompletos';
  END IF;
  EXECUTE d;

  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_profit_by_model';
  IF d IS NULL THEN RAISE EXCEPTION 'report_profit_by_model no existe'; END IF;
  o := d;
  d := replace(d,
    E'    FROM public.forklifts f\n  ),',
    E'    FROM public.forklifts f\n    WHERE f.deleted_at IS NULL\n      AND f.is_e2e IS NOT TRUE\n  ),');
  d := replace(d,
    E'    WHERE ml.performed_at IS NOT NULL\n      AND ml.performed_at::date BETWEEN _start AND _end',
    E'    WHERE ml.performed_at IS NOT NULL\n      AND ml.deleted_at IS NULL\n      AND ml.performed_at::date BETWEEN _start AND _end');
  d := replace(d,
    E'    WHERE dr.created_at IS NOT NULL\n      AND dr.created_at::date BETWEEN _start AND _end',
    E'    WHERE dr.created_at IS NOT NULL\n      AND dr.deleted_at IS NULL\n      AND dr.created_at::date BETWEEN _start AND _end');
  IF d = o THEN RAISE EXCEPTION 'report_profit_by_model: ningun patron aplicado'; END IF;
  IF position('ml.deleted_at IS NULL' in d) = 0
     OR position('dr.deleted_at IS NULL' in d) = 0
     OR position('f.deleted_at IS NULL' in d) = 0 THEN
    RAISE EXCEPTION 'report_profit_by_model: parches incompletos';
  END IF;
  EXECUTE d;

  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_stats';
  IF d IS NULL THEN RAISE EXCEPTION 'get_dashboard_stats no existe'; END IF;
  o := d;
  d := replace(d,
    E'        FROM maintenance_logs\n        WHERE next_service_date IS NOT NULL',
    E'        FROM maintenance_logs\n        WHERE next_service_date IS NOT NULL\n          AND deleted_at IS NULL\n          AND is_e2e IS NOT TRUE');
  IF d = o THEN RAISE EXCEPTION 'get_dashboard_stats: patron maintenance_alerts no encontrado'; END IF;
  EXECUTE d;
END
$mig$;
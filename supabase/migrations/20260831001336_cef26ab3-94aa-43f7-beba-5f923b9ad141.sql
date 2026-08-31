-- A3-02 / A3-03 / A3-05b / A3-08
DO $mig$
DECLARE d text; o text;
BEGIN
  -- A3-02
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='assign_forklift_to_sale_quote';
  o := d;
  d := replace(d,
    E'    IF v_prev = ''sold'' THEN',
    E'    IF v_prev IN (''maintenance'', ''out_of_service'') THEN\n      RAISE EXCEPTION ''El montacargas % está en mantenimiento o fuera de servicio; no puede venderse'', v_fid\n        USING ERRCODE = ''check_violation'';\n    END IF;\n    IF EXISTS (\n      SELECT 1 FROM public.bookings b\n       WHERE b.forklift_id = v_fid\n         AND b.status = ''confirmed''\n         AND b.start_date <= public.today_mty()\n         AND (b.end_date IS NULL OR b.end_date >= public.today_mty())\n    ) THEN\n      RAISE EXCEPTION ''El montacargas % tiene una reserva vigente; complétala o cancélala antes de venderlo'', v_fid\n        USING ERRCODE = ''check_violation'';\n    END IF;\n    IF v_prev = ''sold'' THEN');
  IF d = o THEN RAISE EXCEPTION 'assign_forklift_to_sale_quote: patron no encontrado'; END IF;
  EXECUTE d;

  -- A3-05b
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='unassign_forklift_from_sale_quote';
  o := d;
  d := replace(d,
    E'  IF v_prev <> ''sold'' THEN',
    E'  IF EXISTS (\n    SELECT 1 FROM public.invoices i\n     WHERE i.quote_id = v_assignment.quote_id\n       AND i.status <> ''cancelled''\n  ) THEN\n    RAISE EXCEPTION ''No se puede desasignar: existe una factura emitida para esta venta''\n      USING ERRCODE = ''check_violation'';\n  END IF;\n\n  IF v_prev <> ''sold'' THEN');
  IF d = o THEN RAISE EXCEPTION 'unassign_forklift_from_sale_quote: patron no encontrado'; END IF;
  EXECUTE d;

  -- A3-03 / A3-08
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='complete_return_inspection';
  o := d;
  d := replace(d,
    E'    v_new_status := CASE WHEN v_sends_to_maintenance THEN ''maintenance'' ELSE ''available'' END;',
    E'    v_new_status := CASE\n      WHEN v_sends_to_maintenance THEN ''maintenance''\n      WHEN EXISTS (\n        SELECT 1 FROM bookings b\n         WHERE b.forklift_id = p_forklift_id\n           AND b.id <> p_booking_id\n           AND b.status = ''confirmed''\n           AND b.start_date <= public.today_mty()\n           AND (b.end_date IS NULL OR b.end_date >= public.today_mty())\n      ) THEN ''rented''\n      ELSE ''available'' END;');
  d := replace(d,
    E'  INSERT INTO return_inspections (booking_id, forklift_id, condition,',
    E'  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '''' THEN\n    RAISE EXCEPTION ''El nivel de combustible es obligatorio en la inspección de devolución''\n      USING ERRCODE = ''check_violation'';\n  END IF;\n\n  INSERT INTO return_inspections (booking_id, forklift_id, condition,');
  IF d = o OR position('nivel de combustible' in d) = 0 OR position(E'THEN ''rented''' in d) = 0 THEN
    RAISE EXCEPTION 'complete_return_inspection: parche incompleto';
  END IF;
  EXECUTE d;
END
$mig$;
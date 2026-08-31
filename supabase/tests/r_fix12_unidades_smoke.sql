-- Smoke SQL de fix-12 (integridad de estatus de unidades):
--   N-6  create_booking / get_available_forklifts bloquean rentas vencidas sin devolución
--   N-41 cancel_booking / sync_forklift_on_booking_exit / sync_forklift_rental_status
--        consideran "renta físicamente activa" a la vencida sin devolución
--   N-42 validate_transition bloquea cualquier salida de 'rented' sin devolución
--   N-38 complete_return_inspection bloquea la fila y libera sólo si sigue 'rented'
--   N-39 apply_delivery_completed_effects promueve sólo desde 'available'
--   psql -f supabase/tests/r_fix12_unidades_smoke.sql
-- Solo lecturas de catálogo: no toca datos.

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
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name
  LIMIT 1;
$$;

-- N-6: reserva y disponibilidad bloquean la unidad no devuelta.
SELECT pg_temp.expect_true(
  'N-6 create_booking rechaza reservar una unidad con renta vencida sin devolución',
  pg_temp.fndef('create_booking') ILIKE '%renta vencida sin devolución%'
);
SELECT pg_temp.expect_true(
  'N-6 create_booking evalúa return_status',
  pg_temp.fndef('create_booking') ILIKE '%return_status IS DISTINCT FROM ''returned''%'
);
SELECT pg_temp.expect_true(
  'N-6 get_available_forklifts oculta unidades con renta vencida sin devolución',
  pg_temp.fndef('get_available_forklifts') ILIKE '%return_status IS DISTINCT FROM ''returned''%'
);
SELECT pg_temp.expect_true(
  'N-6 create_booking conserva el guard de cotización aceptada',
  pg_temp.fndef('create_booking') ILIKE '%debe estar aceptada por el cliente%'
);
SELECT pg_temp.expect_true(
  'N-6 create_booking conserva el buffer de mantenimiento',
  pg_temp.fndef('create_booking') ILIKE '%maintenance_buffer_days()%'
);

-- N-41: las tres rutas de liberación usan la definición ampliada.
SELECT pg_temp.expect_true(
  'N-41 cancel_booking no libera una unidad con renta vencida sin devolución',
  pg_temp.fndef('cancel_booking') ILIKE '%return_status IS DISTINCT FROM ''returned''%'
);
SELECT pg_temp.expect_true(
  'N-41 sync_forklift_on_booking_exit usa la renta físicamente activa',
  pg_temp.fndef('sync_forklift_on_booking_exit') ILIKE '%return_status IS DISTINCT FROM ''returned''%'
);
SELECT pg_temp.expect_true(
  'N-41 sync_forklift_rental_status no degrada rentas vencidas sin devolución',
  pg_temp.fndef('sync_forklift_rental_status') ILIKE '%return_status IS DISTINCT FROM ''returned''%'
);
SELECT pg_temp.expect_true(
  'N-41 sync_forklift_rental_status conserva el guard de admin',
  pg_temp.fndef('sync_forklift_rental_status') ILIKE '%has_role((select auth.uid()), ''admin''%'
);

-- N-42: la guarda cubre cualquier salida de 'rented'.
SELECT pg_temp.expect_true(
  'N-42 validate_transition bloquea cualquier salida de rented sin devolución',
  pg_temp.fndef('validate_transition') ILIKE '%NEW.status::text IS DISTINCT FROM ''rented''%'
);
SELECT pg_temp.expect_true(
  'N-42 validate_transition exime el flujo interno app.forklift_rpc',
  pg_temp.fndef('validate_transition') ILIKE '%current_setting(''app.forklift_rpc'', true) IS DISTINCT FROM ''on''%'
);
SELECT pg_temp.expect_true(
  'N-42 validate_transition conserva el bypass N-3 de cxp_recalc',
  pg_temp.fndef('validate_transition') ILIKE '%app.cxp_recalc%'
);
SELECT pg_temp.expect_true(
  'N-42 validate_transition conserva el guard 4.3 de pagos en CxP',
  pg_temp.fndef('validate_transition') ILIKE '%elimina o reversa los pagos primero%'
);

-- N-38: devolución serializada e idempotente.
SELECT pg_temp.expect_true(
  'N-38 complete_return_inspection bloquea la fila del montacargas',
  pg_temp.fndef('complete_return_inspection') ILIKE '%FROM forklifts WHERE id = p_forklift_id FOR UPDATE%'
);
SELECT pg_temp.expect_true(
  'N-38 complete_return_inspection libera sólo si la unidad sigue rentada',
  pg_temp.fndef('complete_return_inspection') ILIKE '%IF v_old_status = ''rented'' THEN%'
);
SELECT pg_temp.expect_true(
  'N-38 complete_return_inspection registra bitácora sólo si hubo cambio',
  pg_temp.fndef('complete_return_inspection') ILIKE '%INSERT INTO status_logs%v_old_status, v_new_status%'
);
SELECT pg_temp.expect_true(
  'N-38 complete_return_inspection conserva el cálculo de horas extra',
  pg_temp.fndef('complete_return_inspection') ILIKE '%suggested_extra_hour_charge%'
);

-- N-39: promoción sólo desde 'available'.
SELECT pg_temp.expect_true(
  'N-39 apply_delivery_completed_effects promueve sólo desde available',
  pg_temp.fndef('apply_delivery_completed_effects') ILIKE '%AND status = ''available''%'
);
SELECT pg_temp.expect_true(
  'N-39 apply_delivery_completed_effects registra el estatus previo real',
  pg_temp.fndef('apply_delivery_completed_effects') ILIKE '%v_from_status%'
);
SELECT pg_temp.expect_true(
  'N-39 el trigger de entregas completadas existe',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'deliveries' AND t.tgname = 'trg_delivery_completed_effects'
  )
);

-- Reglas permanentes: search_path y permisos.
SELECT pg_temp.expect_true(
  'Las funciones tocadas fijan search_path = public',
  (SELECT bool_and(p.proconfig::text ILIKE '%search_path%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_booking','get_available_forklifts','cancel_booking',
                        'sync_forklift_on_booking_exit','sync_forklift_rental_status',
                        'validate_transition','complete_return_inspection',
                        'apply_delivery_completed_effects'))
);
SELECT pg_temp.expect_true(
  'anon no puede ejecutar get_available_forklifts',
  NOT has_function_privilege('anon', 'public.get_available_forklifts(date, date)', 'EXECUTE')
);

ROLLBACK;

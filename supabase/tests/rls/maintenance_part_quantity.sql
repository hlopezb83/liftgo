-- 0146: canonical schema/RLS, real authorization and stock/cost triggers.
BEGIN;
\ir ../../../scripts/tests/maintenance/consumption-fixture.sql
DO $extra$
BEGIN
  PERFORM set_config('app.organization_id','14600000-0000-4000-8000-000000000001',true);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,unit_cost) VALUES
    ('14600000-0000-4000-8000-000000000042','Captured zero','CONSUMPTION-ZERO',10,0);
  PERFORM set_config('app.organization_id','14600000-0000-4000-8000-000000000002',true);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,unit_cost) VALUES
    ('14600000-0000-4000-8000-000000000045','Other tenant part','CONSUMPTION-OTHER',10,100);
END $extra$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"14600000-0000-4000-8000-000000000011","role":"authenticated"}';
DO $consume$
DECLARE v_result jsonb; v_quantity integer; v_id uuid;
BEGIN
  v_result := public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',2);
  IF (v_result->>'quantity_used')::integer <> 3 OR (v_result->>'cost_at_time')::numeric <> 100
     OR v_result->>'id' <> '14600000-0000-4000-8000-000000000060'
     OR (SELECT count(*) FROM public.maintenance_parts WHERE maintenance_log_id='14600000-0000-4000-8000-000000000050') <> 1
     OR (SELECT stock_quantity FROM public.parts_inventory WHERE id='14600000-0000-4000-8000-000000000040') <> 7
     OR (SELECT cost FROM public.maintenance_logs WHERE id='14600000-0000-4000-8000-000000000050') <> 400 THEN
    RAISE EXCEPTION 'Increment did not retain one line and update stock/cost exactly once';
  END IF;
  UPDATE public.parts_inventory SET unit_cost=250 WHERE id='14600000-0000-4000-8000-000000000040';
  v_result := public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',1);
  IF (v_result->>'quantity_used')::integer <> 4 OR (v_result->>'cost_at_time')::numeric <> 100
     OR (SELECT cost FROM public.maintenance_logs WHERE id='14600000-0000-4000-8000-000000000050') <> 500 THEN
    RAISE EXCEPTION 'Inventory price silently repriced earlier consumption';
  END IF;
  v_result := public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000051','14600000-0000-4000-8000-000000000040',1);
  IF (v_result->>'cost_at_time')::numeric <> 250 THEN RAISE EXCEPTION 'New line did not use current server cost'; END IF;
  PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000042',1);
  UPDATE public.parts_inventory SET unit_cost=75 WHERE id='14600000-0000-4000-8000-000000000042';
  v_result := public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000042',1);
  IF (v_result->>'cost_at_time')::numeric <> 0 OR (v_result->>'quantity_used')::integer <> 2 THEN
    RAISE EXCEPTION 'Legitimate captured zero was replaced';
  END IF;
  FOREACH v_quantity IN ARRAY ARRAY[NULL::integer,0,-1,100] LOOP
    BEGIN
      PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',v_quantity);
      RAISE EXCEPTION 'Invalid quantity/insufficient stock accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  FOREACH v_id IN ARRAY ARRAY['14600000-0000-4000-8000-000000000052'::uuid,'14600000-0000-4000-8000-000000000053'::uuid] LOOP
    BEGIN
      PERFORM public.add_maintenance_part_quantity(v_id,'14600000-0000-4000-8000-000000000040',1);
      RAISE EXCEPTION 'Closed/cancelled order accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000054','14600000-0000-4000-8000-000000000040',1);
    RAISE EXCEPTION 'Foreign order accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000045',1);
    RAISE EXCEPTION 'Foreign inventory accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT stock_quantity FROM public.parts_inventory WHERE id='14600000-0000-4000-8000-000000000040') <> 5
     OR (SELECT quantity_used FROM public.maintenance_parts WHERE id='14600000-0000-4000-8000-000000000060') <> 4 THEN
    RAISE EXCEPTION 'Rejected operation changed stock/consumption';
  END IF;
END $consume$;

SET LOCAL request.jwt.claims='{"sub":"14600000-0000-4000-8000-000000000010","role":"authenticated"}';
SELECT public.soft_delete_maintenance_log('14600000-0000-4000-8000-000000000051');
DO $archive$
BEGIN
  BEGIN
    PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000051','14600000-0000-4000-8000-000000000040',1);
    RAISE EXCEPTION 'Archived order accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%archivada%' THEN RAISE; END IF;
  END;
END $archive$;

SET LOCAL request.jwt.claims='{"sub":"14600000-0000-4000-8000-000000000012","role":"authenticated"}';
DO $reader$
BEGIN
  BEGIN
    PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',1);
    RAISE EXCEPTION 'Read-only role consumed inventory';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $reader$;
RESET ROLE;
UPDATE public.role_permissions SET access_level='read' WHERE role='mechanic' AND module='Mantenimiento';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"14600000-0000-4000-8000-000000000011","role":"authenticated"}';
DO $module$
BEGIN
  BEGIN
    PERFORM public.add_maintenance_part_quantity('14600000-0000-4000-8000-000000000050','14600000-0000-4000-8000-000000000040',1);
    RAISE EXCEPTION 'Mechanic without Mantenimiento/full consumed inventory';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $module$;
RESET ROLE;
DO $acl$
DECLARE v_signature text := 'public.add_maintenance_part_quantity(uuid,uuid,integer)';
BEGIN
  IF has_function_privilege('anon',v_signature,'EXECUTE')
     OR has_function_privilege('service_role',v_signature,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_signature,'EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_signature::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='maintenance_parts_log_part_unique') THEN
    RAISE EXCEPTION 'RPC ACL/INVOKER or existing unique index changed';
  END IF;
END $acl$;
ROLLBACK;

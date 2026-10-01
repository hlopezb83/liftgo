-- 0086: inventory metadata/adjustment, OT reassignment, manual damage and scoped evidence.
BEGIN;

DO $setup$
DECLARE v_a uuid:='86000000-0000-4000-8000-0000000000a0'; v_b uuid:='86000000-0000-4000-8000-0000000000b0'; v_legacy_ot uuid;
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES
    (v_a,'Taller Operaciones Norte','ops-0086-a'),(v_b,'Taller Operaciones Bajío','ops-0086-b');
  PERFORM set_config('app.organization_id',v_a::text,true);
  INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
    ('86000000-0000-4000-8000-0000000000a1','ops86.admin.a@example.com',now(),now()),
    ('86000000-0000-4000-8000-0000000000a2','ops86.mechanic.a@example.com',now(),now()),
    ('86000000-0000-4000-8000-0000000000a3','ops86.office.a@example.com',now(),now()),
    ('86000000-0000-4000-8000-0000000000a4','ops86.othermechanic.a@example.com',now(),now()),
    ('86000000-0000-4000-8000-0000000000a5','ops86.dispatch.a@example.com',now(),now());
  INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
    (v_a,'86000000-0000-4000-8000-0000000000a1','internal'),
    (v_a,'86000000-0000-4000-8000-0000000000a2','internal'),
    (v_a,'86000000-0000-4000-8000-0000000000a3','internal'),
    (v_a,'86000000-0000-4000-8000-0000000000a4','internal'),
    (v_a,'86000000-0000-4000-8000-0000000000a5','internal');
  INSERT INTO public.user_roles(user_id,role) VALUES
    ('86000000-0000-4000-8000-0000000000a1','admin'),
    ('86000000-0000-4000-8000-0000000000a2','mechanic'),
    ('86000000-0000-4000-8000-0000000000a3','administrativo'),
    ('86000000-0000-4000-8000-0000000000a4','mechanic'),
    ('86000000-0000-4000-8000-0000000000a5','dispatcher')
    ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.forklifts(id,name,model,organization_id,status) VALUES
    ('86000000-0000-4000-8000-00000000fa01','OPS-SOURCE','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa02','OPS-TARGET','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa03','OPS-SOLD','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa04','OPS-RETIRED','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa05','OPS-DAMAGE','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa06','OPS-IN-FIELD','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa07','OPS-MANUAL-HOLD','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa08','OPS-LEGACY-OT-SOURCE','Toyota 8FG25',v_a,'available'),
    ('86000000-0000-4000-8000-00000000fa09','OPS-LEGACY-OT-TARGET','Toyota 8FG25',v_a,'available');
  PERFORM set_config('app.forklift_rpc','on',true);
  UPDATE public.forklifts SET status=CASE
    WHEN id='86000000-0000-4000-8000-00000000fa03' THEN 'sold'
    WHEN id='86000000-0000-4000-8000-00000000fa04' THEN 'retired'
    ELSE 'maintenance' END
    WHERE id IN ('86000000-0000-4000-8000-00000000fa03','86000000-0000-4000-8000-00000000fa04',
      '86000000-0000-4000-8000-00000000fa07','86000000-0000-4000-8000-00000000fa08');
  PERFORM set_config('app.forklift_rpc','off',true);
  INSERT INTO public.status_logs(forklift_id,from_status,to_status,note,organization_id,changed_at)
    VALUES('86000000-0000-4000-8000-00000000fa07','available','maintenance','Mantenimiento manual: retener para inspección de seguridad',v_a,clock_timestamp());
  -- Emulate the deployed pre-September OT ingress; inserting its parent while
  -- already in maintenance must not replace that historical transition note.
  INSERT INTO public.status_logs(forklift_id,from_status,to_status,note,organization_id,changed_at)
    VALUES('86000000-0000-4000-8000-00000000fa08','available','maintenance','OT Cambio de filtros en progreso',v_a,clock_timestamp());
  INSERT INTO public.maintenance_logs(forklift_id,service_type,work_status,manual_cost,organization_id)
    VALUES('86000000-0000-4000-8000-00000000fa08','Cambio de filtros','in_progress',0,v_a) RETURNING id INTO v_legacy_ot;
  PERFORM set_config('test.ops_legacy_ot',v_legacy_ot::text,true);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,min_stock_level,unit_cost,organization_id)
    VALUES('86000000-0000-4000-8000-0000000000aa','Filtro aceite control','OPS-0086-OIL',10,2,250,v_a);
  PERFORM set_config('app.organization_id',v_b::text,true);
  INSERT INTO auth.users(id,email,created_at,updated_at)
    VALUES('86000000-0000-4000-8000-0000000000b1','ops86.admin.b@example.com',now(),now());
  INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type)
    VALUES(v_b,'86000000-0000-4000-8000-0000000000b1','internal');
  INSERT INTO public.user_roles(user_id,role) VALUES('86000000-0000-4000-8000-0000000000b1','admin')
    ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.forklifts(id,name,model,organization_id)
    VALUES('86000000-0000-4000-8000-00000000fb01','OPS-OTHER-ORG','Hyster H50FT',v_b);
  INSERT INTO public.parts_inventory(id,name,sku,stock_quantity,min_stock_level,unit_cost,organization_id)
    VALUES('86000000-0000-4000-8000-0000000000bb','Filtro aceite control','OPS-0086-OIL',10,2,250,v_b);
  INSERT INTO public.part_stock_adjustments(organization_id,part_id,previous_quantity,new_quantity,reason,adjusted_by)
    VALUES(v_b,'86000000-0000-4000-8000-0000000000bb',11,10,'Conteo de almacén','86000000-0000-4000-8000-0000000000b1');
  INSERT INTO storage.buckets(id,name) VALUES('documents','documents') ON CONFLICT(id) DO NOTHING;
  PERFORM set_config('app.organization_id',v_a::text,true);
END $setup$;

-- Auth fixtures without app_metadata are deliberately not provisioned by 0061.
-- Provision active profiles explicitly, as the real internal-user flow does.
-- This runs only in the ephemeral suite transaction and is rolled back.
DO $active_profiles$
DECLARE v_member record; v_previous text := current_setting('app.organization_id', true);
BEGIN
  FOR v_member IN
    SELECT m.organization_id, u.id, u.email
      FROM public.organization_memberships m JOIN auth.users u ON u.id=m.auth_user_id
      JOIN public.user_roles ur ON ur.user_id=u.id
     WHERE m.member_type='internal' AND ur.role <> 'customer'
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=u.id)
  LOOP
    PERFORM set_config('app.organization_id',v_member.organization_id::text,true);
    INSERT INTO public.profiles(user_id,full_name,email,is_active)
      VALUES(v_member.id,v_member.email,v_member.email,true);
  END LOOP;
  PERFORM set_config('app.organization_id',COALESCE(v_previous,''),true);
END $active_profiles$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
DO $office$
DECLARE v_ot uuid; v_denied boolean:=false;
BEGIN
  INSERT INTO public.maintenance_logs(forklift_id,service_type,work_status,manual_cost)
    VALUES('86000000-0000-4000-8000-00000000fa01','Revisión operativa','pending',0) RETURNING id INTO v_ot;
  PERFORM set_config('test.ops_ot',v_ot::text,true);
  UPDATE public.maintenance_logs SET description='Inspección antes de salida' WHERE id=v_ot;
  UPDATE public.maintenance_logs SET forklift_id='86000000-0000-4000-8000-00000000fa02' WHERE id=v_ot;
  IF (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa01')<>'available'
    OR (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa02')<>'maintenance' THEN
    RAISE EXCEPTION 'OP-R2-02: no se reconciliaron origen y destino';
  END IF;
  BEGIN UPDATE public.maintenance_logs SET forklift_id='86000000-0000-4000-8000-00000000fb01' WHERE id=v_ot;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Reasignación entre empresas permitida'; END IF;
  UPDATE public.maintenance_logs SET forklift_id='86000000-0000-4000-8000-00000000fa09'
    WHERE id=current_setting('test.ops_legacy_ot')::uuid;
  IF (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa08')<>'available'
    OR (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa09')<>'maintenance' THEN
    RAISE EXCEPTION 'Reasignar OT histórica en progreso no reconcilió origen/destino';
  END IF;
END $office$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $stock$
DECLARE v_part public.parts_inventory; v_denied boolean; v_ot uuid:=current_setting('test.ops_ot')::uuid;
BEGIN
  INSERT INTO public.maintenance_parts(maintenance_log_id,part_id,quantity_used,cost_at_time)
    VALUES(v_ot,'86000000-0000-4000-8000-0000000000aa',1,250);
  v_part:=public.update_part_inventory_metadata('86000000-0000-4000-8000-0000000000aa',2,250,'Rack B1');
  IF v_part.stock_quantity<>9 OR v_part.location<>'Rack B1' THEN RAISE EXCEPTION 'OP-R2-01: editar ubicación perdió consumo'; END IF;
  v_denied:=false;
  BEGIN UPDATE public.parts_inventory SET stock_quantity=10 WHERE id=v_part.id;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UPDATE directo de stock permitido'; END IF;
  v_denied:=false;
  BEGIN PERFORM public.adjust_part_stock(v_part.id,10,12,'Conteo antiguo');
  EXCEPTION WHEN serialization_failure THEN v_denied:=true; END;
  IF NOT v_denied OR (SELECT stock_quantity FROM public.parts_inventory WHERE id=v_part.id)<>9 THEN
    RAISE EXCEPTION 'Un conteo obsoleto sobrescribió un consumo';
  END IF;
  v_part:=public.adjust_part_stock(v_part.id,9,8,'Conteo físico después del consumo');
  IF v_part.stock_quantity<>8 OR (SELECT count(*) FROM public.part_stock_adjustments WHERE part_id=v_part.id)<>1 THEN
    RAISE EXCEPTION 'Ajuste válido sin inventario/historial atómico';
  END IF;
  v_denied:=false;
  BEGIN PERFORM public.update_part_inventory_metadata('86000000-0000-4000-8000-0000000000bb',2,250,'Rack ajeno');
  EXCEPTION WHEN no_data_found THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Metadata entre empresas permitida'; END IF;
  v_denied:=false;
  BEGIN PERFORM public.adjust_part_stock('86000000-0000-4000-8000-0000000000bb',10,5,'Conteo ajeno');
  EXCEPTION WHEN no_data_found THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Stock entre empresas permitido'; END IF;
  v_denied:=false;
  BEGIN PERFORM public.update_part_inventory_metadata(v_part.id,2,'NaN'::numeric,'Rack B1');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Costo no finito permitido'; END IF;
  IF EXISTS(SELECT 1 FROM public.part_stock_adjustments WHERE organization_id='86000000-0000-4000-8000-0000000000b0') THEN
    RAISE EXCEPTION 'Lectura de historial de otra empresa permitida';
  END IF;
  v_denied:=false;
  BEGIN UPDATE public.maintenance_logs SET forklift_id='86000000-0000-4000-8000-00000000fa01' WHERE id=v_ot;
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Se movió la procedencia de una OT con consumo'; END IF;
END $stock$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $mechanic$
DECLARE v_damage public.damage_records; v_denied boolean; v_path text; v_doc uuid;
BEGIN
  v_damage:=public.save_manual_damage_report('86000000-0000-4000-8000-00000000fa05','Estimación inicial',650);
  PERFORM set_config('test.ops_damage',v_damage.id::text,true);
  IF v_damage.reported_by IS DISTINCT FROM auth.uid() OR v_damage.previous_forklift_status<>'available'
    OR (SELECT status FROM public.forklifts WHERE id=v_damage.forklift_id)<>'maintenance' THEN
    RAISE EXCEPTION 'OP-R3-01: un daño manual no dejó estado operativo coherente';
  END IF;
  IF NOT public.forklift_has_maintenance_block('86000000-0000-4000-8000-0000000000a0',v_damage.forklift_id,public.today_mty()+1,public.today_mty()+3)
    OR EXISTS(SELECT 1 FROM public.get_available_forklifts(public.today_mty()+1,public.today_mty()+3) WHERE id=v_damage.forklift_id) THEN
    RAISE EXCEPTION 'Daño abierto ofrecido como disponible';
  END IF;
  v_damage:=public.save_manual_damage_report(v_damage.forklift_id,'Estimación corregida',975,NULL,v_damage.id,v_damage.updated_at);
  IF v_damage.estimated_cost<>975 OR v_damage.description<>'Estimación corregida'
    OR (SELECT count(*) FROM public.damage_records WHERE forklift_id=v_damage.forklift_id)<>1 THEN
    RAISE EXCEPTION 'OP-R3-02: corrección perdió campos o duplicó reporte';
  END IF;
  v_denied:=false;
  BEGIN PERFORM public.save_manual_damage_report(v_damage.forklift_id,'Edición obsoleta',800,NULL,v_damage.id,'2001-01-01'::timestamptz);
  EXCEPTION WHEN serialization_failure THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Versión de reporte obsoleta permitida'; END IF;
  v_path:='86000000-0000-4000-8000-0000000000a0/damage_record/'||v_damage.id::text||'/control.png';
  INSERT INTO storage.objects(bucket_id,name) VALUES('documents',v_path);
  INSERT INTO public.documents(entity_type,entity_id,file_name,file_url,file_size,mime_type,uploaded_by)
    VALUES('damage_record',v_damage.id,'control.png','documents/'||v_path,2284,'image/png',auth.uid()) RETURNING id INTO v_doc;
  IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=v_doc) THEN RAISE EXCEPTION 'Mecánico no puede leer su evidencia'; END IF;
  v_denied:=false;
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('documents','86000000-0000-4000-8000-0000000000b0/damage_record/'||v_damage.id::text||'/cross.png');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Upload de evidencia a otro tenant permitido'; END IF;
  v_denied:=false;
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('documents','86000000-0000-4000-8000-0000000000a0/customer/'||v_damage.id::text||'/customer.png');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Se amplió upload a documentos generales'; END IF;
END $mechanic$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
DO $other_mechanic$
DECLARE v_denied boolean:=false; v_damage public.damage_records;
BEGIN
  SELECT * INTO v_damage FROM public.damage_records WHERE id=current_setting('test.ops_damage')::uuid;
  BEGIN PERFORM public.save_manual_damage_report(v_damage.forklift_id,'Reporte de otra persona',300,NULL,v_damage.id,v_damage.updated_at);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied OR public.mechanic_damage_evidence_allowed(v_damage.id,true) THEN RAISE EXCEPTION 'Propiedad de reporte no protegida'; END IF;
END $other_mechanic$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a5","role":"authenticated"}';
DO $dispatcher$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.adjust_part_stock('86000000-0000-4000-8000-0000000000aa',8,7,'Sin permiso');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Despacho obtuvo permiso de inventario'; END IF;
END $dispatcher$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
DO $org_b$
DECLARE v_denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.damage_records WHERE id=current_setting('test.ops_damage')::uuid)
    OR EXISTS(SELECT 1 FROM public.part_stock_adjustments WHERE organization_id='86000000-0000-4000-8000-0000000000a0') THEN
    RAISE EXCEPTION 'Aislamiento A/B de daño o historial insuficiente';
  END IF;
  BEGIN PERFORM public.save_manual_damage_report('86000000-0000-4000-8000-00000000fa05','Intento cruzado',500);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Reporte cruzado entre organizaciones permitido'; END IF;
END $org_b$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $terminal$
DECLARE v_damage public.damage_records; v_ot uuid; v_booking uuid; v_delivery uuid; v_denied boolean:=false;
BEGIN
  BEGIN INSERT INTO public.bookings(forklift_id,start_date,end_date,status)
    VALUES('86000000-0000-4000-8000-00000000fa05',public.today_mty()+1,public.today_mty()+3,'confirmed');
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Reserva confirmada aceptó equipo con daño abierto'; END IF;
  v_damage:=public.save_manual_damage_report('86000000-0000-4000-8000-00000000fa03','Daño histórico equipo vendido',0);
  IF (SELECT status FROM public.forklifts WHERE id=v_damage.forklift_id)<>'sold' THEN RAISE EXCEPTION 'Unidad vendida reactivada'; END IF;
  v_damage:=public.save_manual_damage_report('86000000-0000-4000-8000-00000000fa04','Daño histórico equipo retirado',0);
  IF (SELECT status FROM public.forklifts WHERE id=v_damage.forklift_id)<>'retired' THEN RAISE EXCEPTION 'Unidad retirada reactivada'; END IF;
  UPDATE public.damage_records SET status='repaired',repaired_at=now() WHERE id=current_setting('test.ops_damage')::uuid;
  IF (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa05')<>'available' THEN RAISE EXCEPTION 'Daño reparado no liberó unidad sin otras dependencias'; END IF;
  INSERT INTO public.maintenance_logs(forklift_id,service_type,work_status,manual_cost)
    VALUES('86000000-0000-4000-8000-00000000fa07','OT incidental en retención manual','pending',0) RETURNING id INTO v_ot;
  UPDATE public.maintenance_logs SET work_status='completed',performed_at=public.today_mty() WHERE id=v_ot;
  IF (SELECT status FROM public.forklifts WHERE id='86000000-0000-4000-8000-00000000fa07')<>'maintenance' THEN
    RAISE EXCEPTION 'Cerrar OT incidental liberó mantenimiento manual'; END IF;
  INSERT INTO public.bookings(forklift_id,start_date,end_date,status)
    VALUES('86000000-0000-4000-8000-00000000fa06',public.today_mty(),public.today_mty()+4,'confirmed') RETURNING id INTO v_booking;
  INSERT INTO public.deliveries(booking_id,forklift_id,type,scheduled_date,driver_name)
    VALUES(v_booking,'86000000-0000-4000-8000-00000000fa06','delivery',public.today_mty(),'Operador de prueba') RETURNING id INTO v_delivery;
  PERFORM public.complete_delivery(v_delivery,NULL,0,'Entrega de control para verificar conservación de renta física');
  v_damage:=public.save_manual_damage_report('86000000-0000-4000-8000-00000000fa06','Incidencia de equipo físicamente entregado',0);
  IF (SELECT status FROM public.forklifts WHERE id=v_damage.forklift_id)<>'rented' THEN RAISE EXCEPTION 'Reportar daño borró alquiler físicamente entregado'; END IF;
  UPDATE public.damage_records SET status='repaired',repaired_at=now() WHERE id=v_damage.id;
  PERFORM public.soft_delete_damage_record(v_damage.id);
  IF (SELECT status FROM public.forklifts WHERE id=v_damage.forklift_id)<>'rented' THEN RAISE EXCEPTION 'Reparar/archivar daño liberó alquiler sin devolución'; END IF;
END $terminal$;

RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE user_id='86000000-0000-4000-8000-0000000000a3';
UPDATE public.profiles SET is_active=false WHERE user_id='86000000-0000-4000-8000-0000000000a2';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
DO $inactive$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.adjust_part_stock('86000000-0000-4000-8000-0000000000aa',8,7,'Usuario inactivo');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Usuario inactivo pudo ajustar inventario'; END IF;
END $inactive$;

SET LOCAL request.jwt.claims='{"sub":"86000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
DO $inactive_evidence$
BEGIN
  IF public.mechanic_damage_evidence_allowed(current_setting('test.ops_damage')::uuid,false)
    OR public.mechanic_damage_evidence_allowed(current_setting('test.ops_damage')::uuid,true) THEN
    RAISE EXCEPTION 'Usuario desactivado retuvo acceso a evidencia de daño';
  END IF;
END $inactive_evidence$;

ROLLBACK;

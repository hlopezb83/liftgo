-- Operational corrections (0086): guards and explicit repair of proven derived status drift.
CREATE FUNCTION public.operations_actor_allowed(p_module text,p_level text DEFAULT 'full')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.current_internal_organization_id() IS NOT NULL
    AND public.is_internal_member(auth.uid()) AND public.has_permission(p_module,p_level)
    AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active);
$$;
REVOKE ALL ON FUNCTION public.operations_actor_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operations_actor_allowed(text,text) TO authenticated;
CREATE TABLE public.part_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  part_id uuid NOT NULL REFERENCES public.parts_inventory(id),
  previous_quantity integer NOT NULL CHECK (previous_quantity >= 0),
  new_quantity integer NOT NULL CHECK (new_quantity >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  adjusted_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.part_stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_stock_adjustments FORCE ROW LEVEL SECURITY;
CREATE INDEX part_stock_adjustments_org_part_created_idx ON public.part_stock_adjustments(organization_id,part_id,created_at);
CREATE POLICY org_scope_isolation ON public.part_stock_adjustments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.organization_scope_matches(organization_id)) WITH CHECK (public.organization_scope_matches(organization_id));
CREATE TRIGGER trg_organization_write_context BEFORE INSERT OR UPDATE ON public.part_stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_write_context();
REVOKE ALL ON public.part_stock_adjustments FROM anon, authenticated;
GRANT SELECT ON public.part_stock_adjustments TO authenticated;
CREATE POLICY "Internal inventory adjustment history" ON public.part_stock_adjustments
  FOR SELECT TO authenticated USING (
    public.operations_actor_allowed('Refacciones','read')
    AND organization_id = public.current_internal_organization_id()
  );

-- INVOKER intentionally observes the caller of the UPDATE. A trusted owner RPC
-- or stock-consumption trigger may adjust quantities; authenticated table writes may not.
CREATE FUNCTION public.guard_direct_part_stock_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Para cambiar existencias registra un ajuste de inventario con su motivo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_direct_part_stock_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_direct_part_stock_update BEFORE UPDATE OF stock_quantity ON public.parts_inventory
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_part_stock_update();

CREATE FUNCTION public.update_part_inventory_metadata(p_part_id uuid, p_min_stock_level integer, p_unit_cost numeric, p_location text)
RETURNS public.parts_inventory LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid := public.current_internal_organization_id(); v_part public.parts_inventory;
BEGIN
  IF NOT public.operations_actor_allowed('Refacciones','full') THEN
    RAISE EXCEPTION 'No autorizado para editar inventario.' USING ERRCODE = '42501';
  END IF;
  IF p_min_stock_level IS NULL OR p_min_stock_level < 0 OR p_unit_cost IS NULL OR p_unit_cost < 0
     OR p_unit_cost::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'El mínimo y costo deben ser valores no negativos.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parts_inventory SET min_stock_level=p_min_stock_level, unit_cost=p_unit_cost,
    location=NULLIF(btrim(p_location), ''), updated_at=now()
    WHERE id=p_part_id AND organization_id=v_org AND is_active RETURNING * INTO v_part;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refacción inexistente o no autorizada.' USING ERRCODE = 'P0002'; END IF;
  RETURN v_part;
END $$;
REVOKE ALL ON FUNCTION public.update_part_inventory_metadata(uuid, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_part_inventory_metadata(uuid, integer, numeric, text) TO authenticated;

CREATE FUNCTION public.adjust_part_stock(p_part_id uuid, p_expected_stock_quantity integer, p_new_stock_quantity integer, p_reason text)
RETURNS public.parts_inventory LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid := public.current_internal_organization_id(); v_part public.parts_inventory;
BEGIN
  IF NOT public.operations_actor_allowed('Refacciones','full') THEN
    RAISE EXCEPTION 'No autorizado para ajustar inventario.' USING ERRCODE = '42501';
  END IF;
  IF p_new_stock_quantity IS NULL OR p_new_stock_quantity < 0 OR p_expected_stock_quantity IS NULL
     OR p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Captura un conteo no negativo y el motivo del ajuste.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_part FROM public.parts_inventory
    WHERE id=p_part_id AND organization_id=v_org AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refacción inexistente o no autorizada.' USING ERRCODE = 'P0002'; END IF;
  IF v_part.stock_quantity IS DISTINCT FROM p_expected_stock_quantity THEN
    RAISE EXCEPTION 'Las existencias cambiaron de % a %. Cierra el ajuste, revisa el inventario y vuelve a capturar el conteo.',
      p_expected_stock_quantity, v_part.stock_quantity USING ERRCODE = '40001';
  END IF;
  IF v_part.stock_quantity = p_new_stock_quantity THEN RETURN v_part; END IF;
  INSERT INTO public.part_stock_adjustments (organization_id, part_id, previous_quantity, new_quantity, reason, adjusted_by)
    VALUES (v_org, p_part_id, v_part.stock_quantity, p_new_stock_quantity, btrim(p_reason), auth.uid());
  UPDATE public.parts_inventory SET stock_quantity=p_new_stock_quantity, updated_at=now()
    WHERE id=p_part_id AND organization_id=v_org RETURNING * INTO v_part;
  RETURN v_part;
END $$;
REVOKE ALL ON FUNCTION public.adjust_part_stock(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_part_stock(uuid, integer, integer, text) TO authenticated;

-- Scope existing Administrativo/full to INSERT/UPDATE, never DELETE or fleet permissions.
CREATE POLICY "Administrativo insert maintenance" ON public.maintenance_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrativo') AND public.operations_actor_allowed('Mantenimiento','full')
    AND organization_id=public.current_internal_organization_id());
CREATE POLICY "Administrativo update maintenance" ON public.maintenance_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrativo') AND public.operations_actor_allowed('Mantenimiento','full')
    AND organization_id=public.current_internal_organization_id())
  WITH CHECK (public.has_role(auth.uid(), 'administrativo') AND public.operations_actor_allowed('Mantenimiento','full')
    AND organization_id=public.current_internal_organization_id());

-- Private status reconciliation: physical rental wins while delivered and not returned.
-- An available unit with an open OT/damage enters maintenance; terminal/archived units remain intact.
CREATE FUNCTION public.forklift_maintenance_is_automatic(p_org uuid,p_forklift uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- Exact ingress formats from the historical OT triggers: before September
  -- they wrote "en progreso", then "en <work_status>" / "restaurada en <work_status>".
  -- Same-status continuation notes and free-form manual maintenance do not count.
  SELECT COALESCE((SELECT sl.note ~
    '^(OT .+ (en (progreso|pending|in_progress|waiting_parts)|restaurada en (pending|in_progress|waiting_parts))|(Orden de trabajo|Daño) [0-9a-f-]{36}: actualización operativa|Returned — condition: .+|Migración 0086: corrección de estado derivado de órdenes y daños; se conserva la historia operativa original)$'
    FROM public.status_logs sl WHERE sl.organization_id=p_org AND sl.forklift_id=p_forklift AND sl.to_status='maintenance'
      AND sl.from_status IS DISTINCT FROM sl.to_status
    ORDER BY sl.changed_at DESC,sl.id DESC LIMIT 1),false);
$$;
REVOKE ALL ON FUNCTION public.forklift_maintenance_is_automatic(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reconcile_forklift_operations(p_org uuid, p_forklift uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old text; v_target text; v_deleted timestamptz;
  v_flag text := current_setting('app.forklift_rpc', true);
BEGIN
  SELECT status, deleted_at INTO v_old, v_deleted FROM public.forklifts
    WHERE id=p_forklift AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND OR v_deleted IS NOT NULL OR v_old IN ('retired','sold') THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.deliveries d ON d.booking_id=b.id AND d.organization_id=b.organization_id
    WHERE b.organization_id=p_org AND b.forklift_id=p_forklift AND b.status='confirmed'
      AND NOT public.booking_is_returned(b.id) AND d.type='delivery' AND d.status='completed'
  ) THEN v_target := 'rented';
  ELSIF EXISTS (SELECT 1 FROM public.maintenance_logs ml WHERE ml.organization_id=p_org AND ml.forklift_id=p_forklift
    AND ml.deleted_at IS NULL AND ml.work_status IN ('pending','in_progress','waiting_parts'))
    OR EXISTS (SELECT 1 FROM public.damage_records dr WHERE dr.organization_id=p_org AND dr.forklift_id=p_forklift
    AND dr.deleted_at IS NULL AND (dr.status IN ('reported','in_repair') OR dr.repaired_at IS NULL)) THEN
    v_target := 'maintenance';
  ELSE v_target := CASE
    WHEN v_old='rented' THEN 'available'
    WHEN v_old='maintenance' AND public.forklift_maintenance_is_automatic(p_org,p_forklift) THEN 'available'
    ELSE v_old END;
  END IF;
  IF v_target = v_old THEN RETURN; END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status=v_target, updated_at=now() WHERE id=p_forklift AND organization_id=p_org;
  PERFORM set_config('app.forklift_rpc', COALESCE(v_flag, 'off'), true);
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id,changed_at)
    VALUES (p_forklift, v_old, v_target, p_note, auth.uid(), p_org,clock_timestamp());
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', COALESCE(v_flag, 'off'), true); RAISE;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_forklift_operations(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Lock both units in UUID order before changing an OT. Do not move repair provenance.
CREATE FUNCTION public.lock_maintenance_forklifts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_id uuid; v_old_id uuid;
BEGIN
  v_org := COALESCE(NEW.organization_id, public.current_internal_organization_id(),
    NULLIF(current_setting('app.organization_id',true),'')::uuid);
  IF auth.uid() IS NOT NULL AND (v_org IS DISTINCT FROM public.current_internal_organization_id()
    OR NOT public.operations_actor_allowed('Mantenimiento','full')) THEN
    RAISE EXCEPTION 'Mantenimiento inexistente o no autorizado.' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Organización requerida.' USING ERRCODE='42501'; END IF;
  NEW.organization_id := v_org;
  IF TG_OP='UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'Organización no autorizada.' USING ERRCODE='42501'; END IF;
    v_old_id := OLD.forklift_id;
    IF NEW.forklift_id IS DISTINCT FROM OLD.forklift_id AND (
      OLD.deleted_at IS NOT NULL OR OLD.work_status IN ('completed','cancelled')
      OR EXISTS (SELECT 1 FROM public.damage_records WHERE maintenance_log_id=OLD.id)
      OR EXISTS (SELECT 1 FROM public.maintenance_parts WHERE maintenance_log_id=OLD.id)
      OR EXISTS (SELECT 1 FROM public.maintenance_labor WHERE maintenance_log_id=OLD.id)
    ) THEN RAISE EXCEPTION 'No se puede reasignar una orden cerrada, archivada o con daños/refacciones/mano de obra vinculados.' USING ERRCODE='check_violation'; END IF;
  END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_id,NEW.forklift_id]) AS units(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM 1 FROM public.forklifts WHERE id=v_id AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE='42501'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_maintenance_forklifts() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_aa_lock_maintenance_forklifts BEFORE INSERT OR UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.lock_maintenance_forklifts();

CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_old_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN v_old_id:=OLD.forklift_id; END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_id,NEW.forklift_id]) AS units(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM public.reconcile_forklift_operations(NEW.organization_id,v_id,'Orden de trabajo '||NEW.id::text||': actualización operativa');
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance AFTER INSERT OR UPDATE OF forklift_id,work_status,deleted_at ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();

ALTER TABLE public.damage_records ADD COLUMN reported_by uuid REFERENCES auth.users(id);
COMMENT ON COLUMN public.damage_records.reported_by IS 'Authenticated author of a new manual report; legacy reports keep NULL.';
CREATE FUNCTION public.lock_damage_forklifts_and_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_id uuid; v_old_id uuid; v_status text;
BEGIN
  v_org := COALESCE(NEW.organization_id,public.current_internal_organization_id(),NULLIF(current_setting('app.organization_id',true),'')::uuid);
  IF auth.uid() IS NOT NULL AND (v_org IS DISTINCT FROM public.current_internal_organization_id() OR NOT public.is_internal_member(auth.uid())) THEN
    RAISE EXCEPTION 'Daño inexistente o no autorizado.' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Organización requerida.' USING ERRCODE='42501'; END IF;
  NEW.organization_id := v_org;
  IF TG_OP='INSERT' THEN NEW.reported_by:=auth.uid();
  ELSE
    IF OLD.organization_id IS DISTINCT FROM v_org OR NEW.reported_by IS DISTINCT FROM OLD.reported_by THEN
      RAISE EXCEPTION 'No se puede cambiar la organización ni el autor del daño.' USING ERRCODE='42501';
    END IF;
    v_old_id:=OLD.forklift_id;
    IF NEW.forklift_id IS DISTINCT FROM OLD.forklift_id AND (OLD.inspection_id IS NOT NULL OR OLD.booking_id IS NOT NULL
      OR OLD.maintenance_log_id IS NOT NULL OR OLD.invoice_id IS NOT NULL OR OLD.status <> 'reported' OR OLD.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Un daño vinculado o cerrado no puede cambiar de equipo.' USING ERRCODE='check_violation';
    END IF;
  END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_id,NEW.forklift_id]) AS units(id) WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT status INTO v_status FROM public.forklifts WHERE id=v_id AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE='42501'; END IF;
    IF v_id=NEW.forklift_id AND (TG_OP='INSERT' OR NEW.forklift_id IS DISTINCT FROM v_old_id) THEN NEW.previous_forklift_status:=v_status; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_damage_forklifts_and_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_aa_lock_damage_forklifts BEFORE INSERT OR UPDATE ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.lock_damage_forklifts_and_owner();

CREATE FUNCTION public.sync_forklift_status_on_damage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_old_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN v_old_id:=OLD.forklift_id; END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_old_id,NEW.forklift_id]) AS units(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM public.reconcile_forklift_operations(NEW.organization_id,v_id,'Daño '||NEW.id::text||': actualización operativa');
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_forklift_status_on_damage() FROM PUBLIC,anon,authenticated;
DROP TRIGGER trg_damage_repaired_restore ON public.damage_records;
CREATE TRIGGER trg_sync_forklift_damage AFTER INSERT OR UPDATE OF forklift_id,status,repaired_at,deleted_at ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_status_on_damage();

CREATE FUNCTION public.save_manual_damage_report(p_forklift_id uuid,p_description text,p_estimated_cost numeric,
  p_customer_id uuid DEFAULT NULL,p_damage_id uuid DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.damage_records LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid:=public.current_internal_organization_id(); v_damage public.damage_records; v_id uuid;
BEGIN
  IF NOT public.operations_actor_allowed('Daños','full') THEN
    RAISE EXCEPTION 'No autorizado para reportar daños.' USING ERRCODE='42501';
  END IF;
  IF p_description IS NULL OR btrim(p_description)='' OR p_estimated_cost IS NULL OR p_estimated_cost<0
     OR p_estimated_cost::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Describe el daño y captura un costo no negativo.' USING ERRCODE='22023';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_customers WHERE organization_id=v_org AND customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'Cliente inexistente o no autorizado.' USING ERRCODE='42501';
  END IF;
  -- Lock the report before its units, as with direct report UPDATE and repair work-order RPCs.
  IF p_damage_id IS NOT NULL THEN
    SELECT * INTO v_damage FROM public.damage_records WHERE id=p_damage_id AND organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Daño inexistente o no autorizado.' USING ERRCODE='42501'; END IF;
    IF v_damage.reported_by IS DISTINCT FROM auth.uid() AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')) THEN
      RAISE EXCEPTION 'Solo puedes corregir tus propios reportes manuales.' USING ERRCODE='42501';
    END IF;
  END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[v_damage.forklift_id,p_forklift_id]) AS units(id) WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM 1 FROM public.forklifts WHERE id=v_id AND organization_id=v_org AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE='42501'; END IF;
  END LOOP;
  IF p_damage_id IS NULL THEN
    INSERT INTO public.damage_records (forklift_id,customer_id,description,estimated_cost,status,organization_id)
      VALUES(p_forklift_id,p_customer_id,btrim(p_description),p_estimated_cost,'reported',v_org) RETURNING * INTO v_damage;
  ELSE
    SELECT * INTO v_damage FROM public.damage_records WHERE id=p_damage_id AND organization_id=v_org FOR UPDATE;
    IF v_damage.inspection_id IS NOT NULL OR v_damage.booking_id IS NOT NULL OR v_damage.status<>'reported'
      OR v_damage.deleted_at IS NOT NULL OR v_damage.maintenance_log_id IS NOT NULL OR v_damage.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'El daño ya está vinculado, cerrado o archivado; no puede corregirse desde este reporte.' USING ERRCODE='check_violation';
    END IF;
    IF p_expected_updated_at IS NULL OR v_damage.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'El reporte cambió durante la edición. Cierra el formulario y revisa los datos guardados.' USING ERRCODE='40001';
    END IF;
    UPDATE public.damage_records SET forklift_id=p_forklift_id,customer_id=p_customer_id,description=btrim(p_description),
      estimated_cost=p_estimated_cost,updated_at=clock_timestamp() WHERE id=p_damage_id AND organization_id=v_org RETURNING * INTO v_damage;
  END IF;
  RETURN v_damage;
END $$;
REVOKE ALL ON FUNCTION public.save_manual_damage_report(uuid,text,numeric,uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_manual_damage_report(uuid,text,numeric,uuid,uuid,timestamptz) TO authenticated;

-- Boolean-only access to evidence of an owned manual report; never broad documents access.
CREATE FUNCTION public.mechanic_damage_evidence_allowed(p_damage_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.has_role(auth.uid(),'mechanic')
    AND public.operations_actor_allowed('Daños',CASE WHEN p_write THEN 'full' ELSE 'read' END)
    AND EXISTS(SELECT 1 FROM public.damage_records dr WHERE dr.id=p_damage_id
      AND dr.organization_id=public.current_internal_organization_id() AND dr.reported_by=auth.uid()
      AND dr.inspection_id IS NULL AND dr.booking_id IS NULL AND dr.deleted_at IS NULL
      AND (NOT p_write OR dr.status IN ('reported','in_repair')));
$$;
REVOKE ALL ON FUNCTION public.mechanic_damage_evidence_allowed(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mechanic_damage_evidence_allowed(uuid,boolean) TO authenticated;
CREATE FUNCTION public.mechanic_damage_storage_allowed(p_path text,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_parts text[]:=string_to_array(p_path,'/');
BEGIN
  IF array_length(v_parts,1)<>4 OR v_parts[1] IS DISTINCT FROM public.current_internal_organization_id()::text
    OR v_parts[2]<>'damage_record' OR v_parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR v_parts[4] IS NULL OR v_parts[4] IN ('','.','..') THEN RETURN false; END IF;
  RETURN public.mechanic_damage_evidence_allowed(v_parts[3]::uuid,p_write);
END $$;
REVOKE ALL ON FUNCTION public.mechanic_damage_storage_allowed(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mechanic_damage_storage_allowed(text,boolean) TO authenticated;
CREATE POLICY "Mechanic owned manual damage evidence insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK(entity_type='damage_record' AND organization_id=public.current_internal_organization_id()
    AND uploaded_by=auth.uid() AND public.mechanic_damage_evidence_allowed(entity_id,true)
    AND file_url LIKE 'documents/'||organization_id::text||'/damage_record/'||entity_id::text||'/%');
CREATE POLICY "Mechanic owned manual damage evidence read" ON public.documents FOR SELECT TO authenticated
  USING(entity_type='damage_record' AND organization_id=public.current_internal_organization_id()
    AND public.mechanic_damage_evidence_allowed(entity_id,false));
CREATE POLICY "Mechanic owned manual damage upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='documents' AND public.storage_staff_path_in_current_organization(name,true)
    AND public.mechanic_damage_storage_allowed(name,true));
CREATE POLICY "Mechanic owned manual damage storage read" ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='documents' AND public.storage_staff_path_in_current_organization(name,false)
    AND public.mechanic_damage_storage_allowed(name,false));
CREATE POLICY "Mechanic owned manual damage rollback" ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id='documents' AND public.storage_staff_path_in_current_organization(name,true)
    AND public.mechanic_damage_storage_allowed(name,true)
    AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.organization_id=public.current_internal_organization_id()
      AND d.file_url='documents/'||name));

-- Apply the same open-damage predicate to availability and booking guards.
CREATE OR REPLACE FUNCTION public.forklift_has_maintenance_block(p_org uuid, p_forklift uuid, p_start date, p_end date)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org IS DISTINCT FROM public.current_internal_organization_id()
       OR NOT public.is_internal_member(auth.uid())
       OR NOT public.has_permission('Flota', 'read') THEN
      RAISE EXCEPTION 'No autorizado para consultar disponibilidad.' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
        AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'No autorizado para consultar disponibilidad.' USING ERRCODE = '42501';
  END IF;
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'Organización requerida.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.damage_records dr WHERE dr.organization_id = p_org AND dr.forklift_id = p_forklift
      AND dr.deleted_at IS NULL AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.maintenance_logs ml
     WHERE ml.organization_id = p_org AND ml.forklift_id = p_forklift
       AND ml.deleted_at IS NULL AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT ml.next_service_date FROM public.maintenance_logs ml
       WHERE ml.organization_id = p_org AND ml.forklift_id = p_forklift
         AND ml.next_service_date IS NOT NULL AND ml.deleted_at IS NULL
         AND ml.work_status NOT IN ('scheduled', 'cancelled')
       ORDER BY ml.performed_at DESC, ml.created_at DESC, ml.id DESC LIMIT 1
    ) latest
    CROSS JOIN LATERAL (
      SELECT COALESCE((SELECT cs.maintenance_buffer_days FROM public.company_settings cs
                       WHERE cs.organization_id = p_org LIMIT 1), 3) AS days
    ) buffer
    WHERE latest.next_service_date - buffer.days <= p_end
      AND latest.next_service_date + buffer.days >= p_start
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_damage_record_mechanic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'mechanic'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'administrativo'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  -- A mechanic may correct only their own unlinked manual report while still reported.
  IF OLD.reported_by=auth.uid() AND OLD.status='reported' AND OLD.deleted_at IS NULL
     AND OLD.inspection_id IS NULL AND OLD.booking_id IS NULL AND OLD.maintenance_log_id IS NULL AND OLD.invoice_id IS NULL
     AND NEW.description IS NOT NULL AND btrim(NEW.description)<>'' AND NEW.estimated_cost IS NOT NULL
     AND NEW.estimated_cost>=0 AND NEW.estimated_cost::text NOT IN ('NaN','Infinity','-Infinity')
     AND OLD.organization_id=public.current_internal_organization_id() AND public.operations_actor_allowed('Daños','full')
     AND (to_jsonb(NEW) - ARRAY['description','estimated_cost','customer_id','forklift_id','previous_forklift_status','updated_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['description','estimated_cost','customer_id','forklift_id','previous_forklift_status','updated_at']) THEN
    RETURN NEW;
  END IF;
  -- Only the nested maintenance close trigger can record internal cost for a mechanic.
  IF current_setting('app.damage_cost_sync', true) = 'on' AND pg_trigger_depth() > 1
     AND NEW.actual_cost_source = 'maintenance'
     AND OLD.status = 'repaired' AND OLD.invoice_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.maintenance_logs ml
       WHERE ml.id = OLD.maintenance_log_id AND ml.organization_id = OLD.organization_id
         AND ml.work_status = 'completed' AND NEW.actual_cost = COALESCE(ml.cost, 0)
     )
     AND (to_jsonb(NEW) - ARRAY['actual_cost', 'actual_cost_source', 'actual_cost_recorded_at', 'updated_at'])
       IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_cost', 'actual_cost_source', 'actual_cost_recorded_at', 'updated_at']) THEN
    RETURN NEW;
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description
     OR NEW.estimated_cost IS DISTINCT FROM OLD.estimated_cost
     OR NEW.actual_cost IS DISTINCT FROM OLD.actual_cost
     OR NEW.actual_cost_source IS DISTINCT FROM OLD.actual_cost_source
     OR NEW.actual_cost_recorded_at IS DISTINCT FROM OLD.actual_cost_recorded_at
     OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.inspection_id IS DISTINCT FROM OLD.inspection_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.previous_forklift_status IS DISTINCT FROM OLD.previous_forklift_status THEN
    RAISE EXCEPTION 'Un mechanic solo puede actualizar el estado y cierre del daño (status, maintenance_log_id, repaired_at o su archivo), no montos, cliente ni factura.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'in_repair' AND NEW.status = 'repaired' THEN
      NEW.repaired_at := COALESCE(NEW.repaired_at, now());
    ELSIF OLD.status = 'reported' AND NEW.status = 'in_repair'
          AND NEW.maintenance_log_id IS NOT NULL THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Transición de estado no permitida para mechanic en daños: % -> %. Solo se permite in_repair -> repaired (cierre de reparación) o reported -> in_repair con orden de trabajo ligada.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF OLD.status NOT IN ('reported', 'in_repair') THEN
      RAISE EXCEPTION 'Un mechanic solo puede archivar daños abiertos (reported/in_repair). Estado actual: %.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_booking_operational_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND (NEW.organization_id IS DISTINCT FROM public.current_internal_organization_id()
      OR NOT public.is_internal_member(auth.uid())) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND NEW.forklift_id IS NOT DISTINCT FROM OLD.forklift_id
     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN RETURN NEW; END IF;
  -- Lock the same unit as create_booking; maintenance blocking is evaluated
  -- by the server owner and cannot disappear behind the caller's RLS.
  PERFORM 1 FROM public.forklifts f WHERE f.id = NEW.forklift_id
    AND f.organization_id = NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE = 'P0002';
  END IF;
  IF public.forklift_has_maintenance_block(NEW.organization_id, NEW.forklift_id, NEW.start_date, NEW.end_date) THEN
    RAISE EXCEPTION 'La reserva invade una orden activa, un daño pendiente o la ventana de mantenimiento del montacargas.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- Retain the legacy helper signature used by archive/restore RPCs, with the same
-- scoped reconciliation rules; callers cannot turn a manual hold into availability.
CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(p_forklift_id uuid,p_previous text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $restore$
DECLARE v_org uuid; v_status text; v_deleted timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_org:=public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(auth.uid()) OR NOT (
      public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')
      OR public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'mechanic')) THEN
      RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501';
    END IF;
  ELSIF COALESCE(auth.jwt()->>'role','')<>'service_role'
    AND current_setting('role',true) NOT IN ('none','postgres','service_role') THEN
    RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT organization_id,status,deleted_at INTO v_org,v_status,v_deleted FROM public.forklifts
    WHERE id=p_forklift_id AND (auth.uid() IS NULL OR organization_id=v_org);
  IF NOT FOUND THEN RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE='42501'; END IF;
  IF v_deleted IS NOT NULL OR v_status IN ('sold','retired') THEN RETURN v_status; END IF;
  IF EXISTS(SELECT 1 FROM public.bookings b JOIN public.deliveries d ON d.booking_id=b.id AND d.organization_id=b.organization_id
    WHERE b.organization_id=v_org AND b.forklift_id=p_forklift_id AND b.status='confirmed' AND NOT public.booking_is_returned(b.id)
      AND d.type='delivery' AND d.status='completed') THEN RETURN 'rented'; END IF;
  IF EXISTS(SELECT 1 FROM public.maintenance_logs WHERE organization_id=v_org AND forklift_id=p_forklift_id
      AND deleted_at IS NULL AND work_status IN ('pending','in_progress','waiting_parts'))
    OR EXISTS(SELECT 1 FROM public.damage_records WHERE organization_id=v_org AND forklift_id=p_forklift_id
      AND deleted_at IS NULL AND (status IN ('reported','in_repair') OR repaired_at IS NULL)) THEN RETURN 'maintenance'; END IF;
  IF v_status='maintenance' AND NOT public.forklift_maintenance_is_automatic(v_org,p_forklift_id) THEN RETURN 'maintenance'; END IF;
  RETURN 'available';
END $restore$;
REVOKE ALL ON FUNCTION public.damage_restore_forklift_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.damage_restore_forklift_status(uuid,text) TO authenticated,service_role;

-- Repair only drift with operational provenance. Preserve manual maintenance,
-- physical rentals and sold/retired/archived units. Log this migration action,
-- never backdate a service or pretend the original move happened differently.
DO $repair$
DECLARE v_unit record; v_old_context text:=current_setting('app.organization_id',true); v_status text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'La reconciliación requiere contexto de migración sin usuario autenticado.' USING ERRCODE='42501';
  END IF;
  FOR v_unit IN SELECT id,organization_id FROM public.forklifts
    WHERE deleted_at IS NULL AND status IN ('available','maintenance') ORDER BY organization_id,id
  LOOP
    SELECT status INTO v_status FROM public.forklifts WHERE id=v_unit.id AND organization_id=v_unit.organization_id FOR UPDATE;
    IF v_status='available' AND (
      EXISTS(SELECT 1 FROM public.maintenance_logs ml WHERE ml.organization_id=v_unit.organization_id AND ml.forklift_id=v_unit.id
        AND ml.deleted_at IS NULL AND ml.work_status IN ('pending','in_progress','waiting_parts'))
      OR EXISTS(SELECT 1 FROM public.damage_records dr WHERE dr.organization_id=v_unit.organization_id AND dr.forklift_id=v_unit.id
        AND dr.deleted_at IS NULL AND (dr.status IN ('reported','in_repair') OR dr.repaired_at IS NULL))
    ) OR (v_status='maintenance'
      AND NOT EXISTS(SELECT 1 FROM public.maintenance_logs ml WHERE ml.organization_id=v_unit.organization_id AND ml.forklift_id=v_unit.id
        AND ml.deleted_at IS NULL AND ml.work_status IN ('pending','in_progress','waiting_parts'))
      AND NOT EXISTS(SELECT 1 FROM public.damage_records dr WHERE dr.organization_id=v_unit.organization_id AND dr.forklift_id=v_unit.id
        AND dr.deleted_at IS NULL AND (dr.status IN ('reported','in_repair') OR dr.repaired_at IS NULL))
      AND public.forklift_maintenance_is_automatic(v_unit.organization_id,v_unit.id)
    ) THEN
      PERFORM set_config('app.organization_id',v_unit.organization_id::text,true);
      PERFORM public.reconcile_forklift_operations(v_unit.organization_id,v_unit.id,
        'Migración 0086: corrección de estado derivado de órdenes y daños; se conserva la historia operativa original');
    END IF;
  END LOOP;
  PERFORM set_config('app.organization_id',COALESCE(v_old_context,''),true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.organization_id',COALESCE(v_old_context,''),true); RAISE;
END $repair$;

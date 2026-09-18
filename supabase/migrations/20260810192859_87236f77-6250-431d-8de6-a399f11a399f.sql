ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 16
  CHECK (tax_rate >= 0 AND tax_rate <= 100);

COMMENT ON COLUMN public.customers.tax_rate IS
  'Tasa de IVA (%) aplicable a la facturación del cliente. 16 = general, 8 = frontera, 0 = tasa 0/exento.';

UPDATE public.maintenance_logs
   SET work_status = 'cancelled', updated_at = now()
 WHERE deleted_at IS NOT NULL
   AND work_status IN ('pending', 'in_progress', 'scheduled');

UPDATE public.forklifts f
   SET status = 'available', updated_at = now()
 WHERE f.status = 'maintenance'
   AND f.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs ml
                    WHERE ml.forklift_id = f.id AND ml.deleted_at IS NULL
                      AND ml.work_status IN ('pending', 'in_progress'))
   AND NOT EXISTS (SELECT 1 FROM public.damage_records dr
                    WHERE dr.forklift_id = f.id AND dr.deleted_at IS NULL
                      AND dr.status IN ('reported', 'in_repair'))
   AND NOT EXISTS (SELECT 1 FROM public.bookings b
                    WHERE b.forklift_id = f.id AND b.status = 'confirmed'
                      AND public.today_mty() BETWEEN b.start_date AND b.end_date);

CREATE OR REPLACE FUNCTION public.guard_forklift_status_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status, 'available') IS DISTINCT FROM 'available'
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'El estado inicial de un montacargas debe ser available (recibido: %). Para ponerlo en mantenimiento usa el cambio de estado con razón o una OT.', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_forklift_status_insert ON public.forklifts;
CREATE TRIGGER trg_guard_forklift_status_insert
  BEFORE INSERT ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_status_insert();

CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec public.damage_records%ROWTYPE;
  v_restore text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_rec FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  IF v_rec.invoice_id IS NULL AND v_rec.status NOT IN ('repaired') THEN
    RAISE EXCEPTION 'No se puede archivar el daño sin cargo: liga una factura (invoice_id) o marcalo como reparado (status=repaired) antes de archivarlo. Estado actual: %',
      v_rec.status
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.documents
   WHERE entity_type = 'damage_record'
     AND entity_id = p_damage_id;

  UPDATE damage_records
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_damage_id;

  IF v_rec.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = v_rec.forklift_id
          AND deleted_at IS NULL
          AND id <> p_damage_id
     ) THEN
    v_restore := public.damage_restore_forklift_status(v_rec.forklift_id, v_rec.previous_forklift_status);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_restore, updated_at = now()
     WHERE id = v_rec.forklift_id
       AND status = 'maintenance'
       AND status IS DISTINCT FROM v_restore;
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (v_rec.forklift_id, 'maintenance', v_restore,
              'Daño ' || p_damage_id::text || ' archivado: restauracion de estado');
    END IF;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.soft_delete_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_damage_record(uuid) TO authenticated;

DELETE FROM public.documents d
 WHERE d.entity_type = 'damage_record'
   AND EXISTS (SELECT 1 FROM public.damage_records dr
                WHERE dr.id::text = d.entity_id::text
                  AND dr.deleted_at IS NOT NULL);
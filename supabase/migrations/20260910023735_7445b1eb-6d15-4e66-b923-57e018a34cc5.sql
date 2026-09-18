CREATE OR REPLACE FUNCTION public.save_invoice_with_bookings(
  p_invoice jsonb,
  p_booking_ids uuid[],
  p_invoice_id uuid,
  p_expected_version integer,
  p_damage_id uuid
)
RETURNS SETOF public.invoices
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_damage public.damage_records%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_customer_id uuid;
  v_linked integer;
BEGIN
  IF p_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un cargo por daño sólo puede ligarse al crear la factura.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_damage
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El daño no existe o está archivado. Restáuralo antes de facturar.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_damage.status <> 'repaired' OR v_damage.repaired_at IS NULL THEN
    RAISE EXCEPTION 'El daño debe estar reparado antes de crear su factura.'
      USING ERRCODE = '23514';
  END IF;
  IF v_damage.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'El daño ya está ligado a otra factura.'
      USING ERRCODE = '23505';
  END IF;

  v_customer_id := NULLIF(p_invoice->>'customer_id', '')::uuid;
  IF v_damage.customer_id IS NOT NULL
     AND v_customer_id IS DISTINCT FROM v_damage.customer_id THEN
    RAISE EXCEPTION 'La factura debe pertenecer al cliente del daño.'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.* INTO v_invoice
    FROM public.save_invoice_with_bookings(
      p_invoice,
      COALESCE(p_booking_ids, '{}'::uuid[]),
      NULL,
      p_expected_version
    ) AS s
   LIMIT 1;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear la factura del daño.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.damage_records
     SET status = 'invoiced', invoice_id = v_invoice.id, updated_at = now()
   WHERE id = p_damage_id
     AND deleted_at IS NULL
     AND status = 'repaired'
     AND repaired_at IS NOT NULL
     AND invoice_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  IF v_linked <> 1 THEN
    RAISE EXCEPTION 'El daño cambió mientras se generaba la factura; no se guardó ningún cambio.'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEXT v_invoice;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_invoice_with_bookings(jsonb, uuid[], uuid, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_bookings(jsonb, uuid[], uuid, integer, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_damage_billing_requires_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_billing_changed boolean;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_billing_changed := true;
  ELSE
    v_billing_changed := NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
      OR NEW.status IS DISTINCT FROM OLD.status;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'repaired'
     AND OLD.status IS DISTINCT FROM 'repaired'
     AND NEW.repaired_at IS NULL THEN
    NEW.repaired_at := now();
  END IF;

  IF NEW.status IN ('repaired', 'invoiced') AND NEW.repaired_at IS NULL THEN
    RAISE EXCEPTION 'Un daño reparado o facturado requiere repaired_at.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('reported', 'in_repair') AND NEW.repaired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Un daño abierto no puede conservar repaired_at.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.invoice_id IS NOT NULL OR NEW.status = 'invoiced' THEN
    IF NEW.deleted_at IS NOT NULL AND v_billing_changed THEN
      RAISE EXCEPTION 'Un daño archivado no se puede facturar; restáuralo primero.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> 'invoiced' OR NEW.invoice_id IS NULL THEN
      RAISE EXCEPTION 'El estado facturado y invoice_id deben establecerse juntos.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.repaired_at IS NULL THEN
      RAISE EXCEPTION 'El daño debe estar reparado antes de facturarse.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.deleted_at IS NOT NULL
     AND OLD.deleted_at IS NULL
     AND (NEW.repaired_at IS NULL OR NEW.status NOT IN ('repaired', 'invoiced')) THEN
    RAISE EXCEPTION 'No se puede archivar: primero completa la reparación del daño.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_damage_billing_requires_repair ON public.damage_records;
CREATE TRIGGER trg_damage_billing_requires_repair
  BEFORE INSERT OR UPDATE OF status, invoice_id, repaired_at, deleted_at
  ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_billing_requires_repair();

REVOKE ALL ON FUNCTION public.guard_damage_billing_requires_repair() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_damage_record_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_customer uuid;
  v_booking_customer uuid;
  v_damage_customer uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.customer_id INTO v_booking_customer
      FROM public.bookings b
     WHERE b.id = NEW.booking_id;
  END IF;

  IF NEW.customer_id IS NOT NULL
     AND v_booking_customer IS NOT NULL
     AND NEW.customer_id IS DISTINCT FROM v_booking_customer THEN
    RAISE EXCEPTION 'El cliente del daño no coincide con el cliente de la reserva.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.customer_id INTO v_invoice_customer
    FROM public.invoices i
   WHERE i.id = NEW.invoice_id;
  IF NOT FOUND OR v_invoice_customer IS NULL THEN
    RAISE EXCEPTION 'La factura ligada al daño no existe o no tiene cliente.'
      USING ERRCODE = '23514';
  END IF;

  v_damage_customer := COALESCE(NEW.customer_id, v_booking_customer);
  IF v_damage_customer IS NULL THEN
    RAISE EXCEPTION 'El daño debe tener cliente directo o una reserva con cliente antes de facturarse.'
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice_customer IS DISTINCT FROM v_damage_customer THEN
    RAISE EXCEPTION 'La factura ligada pertenece a otro cliente.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_damage_record_invoice ON public.damage_records;
CREATE TRIGGER trg_guard_damage_record_invoice
  BEFORE INSERT OR UPDATE OF invoice_id, customer_id, booking_id
  ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_invoice();

REVOKE ALL ON FUNCTION public.guard_damage_record_invoice() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_archived_damage_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Un daño archivado es inmutable; restáuralo antes de editarlo.'
        USING ERRCODE = '23514';
    END IF;
    IF current_setting('app.damage_restore', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Usa restore_damage_record para restaurar un daño archivado.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_damage_archived_immutable ON public.damage_records;
CREATE TRIGGER trg_damage_archived_immutable
  BEFORE UPDATE ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_archived_damage_immutable();

REVOKE ALL ON FUNCTION public.guard_archived_damage_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_forklift_maintenance_for_open_damage(
  p_forklift_id uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_status text;
  v_previous_rpc text;
BEGIN
  IF p_forklift_id IS NULL THEN
    RETURN;
  END IF;

  SELECT f.status INTO v_from_status
    FROM public.forklifts f
   WHERE f.id = p_forklift_id
     AND f.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_from_status NOT IN ('available', 'rented') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.damage_records dr
     WHERE dr.forklift_id = p_forklift_id
       AND dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
  ) THEN
    RETURN;
  END IF;

  v_previous_rpc := current_setting('app.forklift_rpc', true);
  PERFORM set_config('app.forklift_rpc', 'on', true);
  BEGIN
    UPDATE public.forklifts
       SET status = 'maintenance', updated_at = now()
     WHERE id = p_forklift_id
       AND status IN ('available', 'rented');
    PERFORM set_config(
      'app.forklift_rpc', COALESCE(NULLIF(v_previous_rpc, ''), 'off'), true
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.forklift_rpc', COALESCE(NULLIF(v_previous_rpc, ''), 'off'), true
    );
    RAISE;
  END;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
  VALUES (p_forklift_id, v_from_status, 'maintenance', p_note, (select auth.uid()));
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_forklift_maintenance_for_open_damage(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_damage_on_invoice_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_folio text;
  v_motivo text;
  r record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.id;
    v_folio := COALESCE(OLD.invoice_number, '');
    v_motivo := 'factura eliminada';
  ELSIF (COALESCE(NEW.status, '') = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled')
     OR (COALESCE(NEW.cancellation_status, '') = 'accepted'
         AND COALESCE(OLD.cancellation_status, '') <> 'accepted') THEN
    v_invoice_id := NEW.id;
    v_folio := COALESCE(NEW.invoice_number, '');
    v_motivo := 'factura cancelada';
  ELSE
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1
      FROM public.damage_records dr
     WHERE dr.invoice_id = v_invoice_id
       AND dr.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una factura ligada a un daño archivado; cancélala primero.'
      USING ERRCODE = '23503';
  END IF;

  FOR r IN
    UPDATE public.damage_records
       SET invoice_id = NULL,
           status = CASE
             WHEN status = 'invoiced' AND repaired_at IS NOT NULL THEN 'repaired'
             WHEN status = 'invoiced' THEN 'reported'
             ELSE status
           END,
           updated_at = now()
     WHERE invoice_id = v_invoice_id
       AND deleted_at IS NULL
    RETURNING id, forklift_id, status, repaired_at
  LOOP
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      r.forklift_id,
      'damage:invoiced',
      'damage:' || r.status,
      'Daño liberado de la facturación (' || v_motivo ||
        CASE WHEN v_folio <> '' THEN ' ' || v_folio ELSE '' END || ')',
      (select auth.uid())
    );

    PERFORM public.ensure_forklift_maintenance_for_open_damage(
      r.forklift_id,
      'Factura de daño cancelada: la reparación física sigue pendiente'
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_damage_on_invoice_cancel() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.restore_forklift_on_damage_repaired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restore text;
  v_closed boolean;
  v_previous_rpc text;
  v_updated boolean := false;
BEGIN
  v_closed := (
    NEW.deleted_at IS NULL
    AND NEW.status IN ('repaired', 'invoiced')
    AND NEW.repaired_at IS NOT NULL
    AND (
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.repaired_at IS NULL
    )
  ) OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL);

  IF NOT v_closed OR NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.forklifts
  WHERE id = NEW.forklift_id
  FOR UPDATE;

  IF NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = NEW.forklift_id
          AND deleted_at IS NULL
          AND id <> NEW.id
          AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs
        WHERE forklift_id = NEW.forklift_id
          AND deleted_at IS NULL
          AND work_status IN ('pending', 'in_progress', 'waiting_parts')
     ) THEN
    v_restore := public.damage_restore_forklift_status(
      NEW.forklift_id,
      NEW.previous_forklift_status
    );
    v_previous_rpc := current_setting('app.forklift_rpc', true);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    BEGIN
      UPDATE public.forklifts
         SET status = v_restore, updated_at = now()
       WHERE id = NEW.forklift_id
         AND status = 'maintenance'
         AND status IS DISTINCT FROM v_restore;
      v_updated := FOUND;
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
      RAISE;
    END;
    IF v_updated THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (
        NEW.forklift_id,
        'maintenance',
        v_restore,
        'Daño ' || NEW.id::text || ' reparado: restauración de estado'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_damage_repaired_restore ON public.damage_records;
CREATE TRIGGER trg_damage_repaired_restore
  BEFORE UPDATE OF status, repaired_at, deleted_at
  ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.restore_forklift_on_damage_repaired();

CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.damage_records%ROWTYPE;
  v_restore text;
  v_previous_rpc text;
  v_updated boolean := false;
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
    FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.repaired_at IS NULL OR v_rec.status NOT IN ('repaired', 'invoiced') THEN
    RAISE EXCEPTION 'No se puede archivar: primero completa la reparación del daño.'
      USING ERRCODE = '23514';
  END IF;
  IF v_rec.status = 'invoiced' AND v_rec.invoice_id IS NULL THEN
    RAISE EXCEPTION 'El daño marcado como facturado no tiene una factura ligada.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.damage_records
     SET deleted_at = now(), deleted_by = (select auth.uid()), updated_at = now()
   WHERE id = p_damage_id;

  IF v_rec.forklift_id IS NOT NULL THEN
    PERFORM 1
    FROM public.forklifts
    WHERE id = v_rec.forklift_id
    FOR UPDATE;
  END IF;

  IF v_rec.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = v_rec.forklift_id
          AND deleted_at IS NULL
          AND id <> p_damage_id
          AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs
        WHERE forklift_id = v_rec.forklift_id
          AND deleted_at IS NULL
          AND work_status IN ('pending', 'in_progress', 'waiting_parts')
     ) THEN
    v_restore := public.damage_restore_forklift_status(
      v_rec.forklift_id,
      v_rec.previous_forklift_status
    );
    v_previous_rpc := current_setting('app.forklift_rpc', true);
    PERFORM set_config('app.forklift_rpc', 'on', true);
    BEGIN
      UPDATE public.forklifts
         SET status = v_restore, updated_at = now()
       WHERE id = v_rec.forklift_id
         AND status = 'maintenance'
         AND status IS DISTINCT FROM v_restore;
      v_updated := FOUND;
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config(
        'app.forklift_rpc', coalesce(nullif(v_previous_rpc, ''), 'off'), true
      );
      RAISE;
    END;
    IF v_updated THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (
        v_rec.forklift_id,
        'maintenance',
        v_restore,
        'Daño ' || p_damage_id::text || ' archivado: restauración de estado'
      );
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_damage_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_damage_record(p_damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.damage_records%ROWTYPE;
  v_invoice_cancelled boolean := false;
  v_target_invoice_id uuid;
  v_target_status text;
  v_previous_restore text;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar daños'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o no está archivado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.invoice_id IS NOT NULL THEN
    SELECT COALESCE(i.status = 'cancelled', false)
           OR COALESCE(i.cancellation_status = 'accepted', false)
      INTO v_invoice_cancelled
      FROM public.invoices i
     WHERE i.id = v_rec.invoice_id;
    IF NOT FOUND THEN
      v_invoice_cancelled := true;
    END IF;
  END IF;

  v_target_invoice_id := CASE
    WHEN v_invoice_cancelled THEN NULL
    ELSE v_rec.invoice_id
  END;
  v_target_status := CASE
    WHEN v_invoice_cancelled AND v_rec.status = 'invoiced'
      THEN CASE WHEN v_rec.repaired_at IS NULL THEN 'reported' ELSE 'repaired' END
    ELSE v_rec.status
  END;

  IF v_target_invoice_id IS NOT NULL
     AND (v_target_status <> 'invoiced' OR v_rec.repaired_at IS NULL) THEN
    RAISE EXCEPTION 'El daño archivado conserva una factura activa pero no una reparación válida.'
      USING ERRCODE = '23514';
  END IF;

  v_previous_restore := current_setting('app.damage_restore', true);
  PERFORM set_config('app.damage_restore', 'on', true);
  BEGIN
    UPDATE public.damage_records
       SET deleted_at = NULL,
           deleted_by = NULL,
           invoice_id = v_target_invoice_id,
           status = v_target_status,
           updated_at = now()
     WHERE id = p_damage_id;
    PERFORM set_config(
      'app.damage_restore', COALESCE(NULLIF(v_previous_restore, ''), 'off'), true
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'app.damage_restore', COALESCE(NULLIF(v_previous_restore, ''), 'off'), true
    );
    RAISE;
  END;

  PERFORM public.ensure_forklift_maintenance_for_open_damage(
    v_rec.forklift_id,
    'Daño ' || p_damage_id::text || ' restaurado con reparación física pendiente'
  );

  IF v_rec.forklift_id IS NOT NULL THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      v_rec.forklift_id,
      'damage:archived',
      'damage:' || v_target_status,
      'Daño ' || p_damage_id::text || ' restaurado desde archivados' ||
        CASE WHEN v_invoice_cancelled THEN '; factura cancelada conciliada' ELSE '' END,
      (select auth.uid())
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_damage_record(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
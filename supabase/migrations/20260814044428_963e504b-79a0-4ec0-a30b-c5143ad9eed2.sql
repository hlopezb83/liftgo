-- R9-DB-01 (reconciliación de drift repo vs. producción): estas funciones ya
-- usan public.today_mty() en producción, pero el último archivo de migración
-- que las define en el repo todavía contenía CURRENT_DATE / now()::date. Una
-- base creada desde cero (CI: `supabase db reset`) quedaba con la versión vieja
-- y r9_smoke.sql fallaba en "R9-02 sin CURRENT_DATE en funciones de negocio".
-- CREATE OR REPLACE conserva los privilegios existentes.

CREATE OR REPLACE FUNCTION public.accept_quote_from_portal(p_quote_id uuid, p_ip text DEFAULT NULL::text)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer UUID;
  v_quote public.quotes;
BEGIN
  v_customer := public.get_customer_id_for_user(auth.uid());
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.customer_id <> v_customer THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'Cotización no disponible para aceptar'; END IF;

  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida';
  END IF;

  UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_ip = p_ip,
        accepted_by_user_id = auth.uid()
    WHERE id = p_quote_id
    RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_fleet_status_consistency()
RETURNS TABLE(forklift_id uuid, forklift_name text, status_actual text, status_esperado text, motivo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH calc AS (
    SELECT
      f.id,
      f.name,
      f.status,
      EXISTS (
        SELECT 1 FROM public.maintenance_logs ml
         WHERE ml.forklift_id = f.id
           AND ml.work_status IN ('pending', 'in_progress')
      ) AS has_open_ot,
      EXISTS (
        SELECT 1 FROM public.damage_records dr
         WHERE dr.forklift_id = f.id
           AND dr.deleted_at IS NULL
           AND dr.status IN ('reported', 'in_repair')
      ) AS has_open_damage,
      EXISTS (
        SELECT 1 FROM public.bookings b
         WHERE b.forklift_id = f.id
           AND b.status = 'confirmed'
           AND public.today_mty() BETWEEN b.start_date AND b.end_date
      ) AS has_active_booking
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL
  ),
  evaluada AS (
    SELECT
      c.*,
      CASE
        WHEN c.has_open_ot OR c.has_open_damage THEN 'maintenance'
        WHEN c.has_active_booking THEN 'rented'
        ELSE 'available'
      END AS esperado,
      concat_ws('; ',
        CASE WHEN c.has_open_ot THEN 'tiene OT abierta (pending/in_progress)' END,
        CASE WHEN c.has_open_damage THEN 'tiene daño abierto (reported/in_repair)' END,
        CASE WHEN c.has_active_booking THEN 'tiene reserva confirmada activa hoy' END,
        CASE WHEN NOT c.has_open_ot AND NOT c.has_open_damage AND NOT c.has_active_booking
             THEN 'sin OT, daño ni reserva activa' END
      ) AS motivo
    FROM calc c
  )
  SELECT
    e.id,
    e.name,
    e.status,
    e.esperado,
    e.motivo
  FROM evaluada e
  WHERE e.status IN ('available', 'rented', 'maintenance')
    AND e.status IS DISTINCT FROM e.esperado
  ORDER BY e.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_insurance_alerts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH base AS (
    SELECT id, name, insurance_expiry, insurance_provider,
      CASE WHEN insurance_expiry IS NOT NULL THEN (insurance_expiry - public.today_mty())::int ELSE NULL END AS days_left
    FROM public.forklifts
    WHERE status NOT IN ('sold','retired')
      AND deleted_at IS NULL
  ),
  expiring AS (
    SELECT id, name, insurance_expiry, insurance_provider, days_left FROM base
    WHERE insurance_expiry IS NOT NULL AND days_left <= 30 ORDER BY days_left ASC
  ),
  no_ins AS (SELECT count(*)::int AS c FROM base WHERE insurance_expiry IS NULL)
  SELECT jsonb_build_object(
    'expiring', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'insurance_expiry', insurance_expiry,
      'insurance_provider', insurance_provider, 'days_left', days_left
    )) FROM expiring), '[]'::jsonb),
    'no_insurance_count', (SELECT c FROM no_ins)
  ) INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_invoice_overdue_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'overdue' THEN
    IF NEW.due_date IS NULL THEN
      RAISE EXCEPTION 'Una factura vencida requiere fecha de vencimiento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.due_date >= public.today_mty() THEN
      RAISE EXCEPTION 'No se puede marcar como vencida una factura cuya fecha de vencimiento (%) aún no ha pasado.', NEW.due_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_quote_expired_rescue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF OLD.status = 'expired' AND NEW.status = 'draft' THEN
    IF NEW.valid_until IS NULL OR NEW.valid_until < public.today_mty() THEN
      RAISE EXCEPTION 'Para rescatar una cotizacion vencida debes fijar una nueva vigencia (valid_until futura) en el mismo movimiento.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'sent'
     AND NEW.valid_until IS NOT NULL AND NEW.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'No se puede enviar una cotizacion con vigencia vencida (valid_until=%). Actualiza precios y vigencia.', NEW.valid_until
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_quote_valid_until()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF OLD.status <> 'draft' AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    IF OLD.status = 'expired' AND NEW.status = 'draft'
       AND NEW.valid_until IS NOT NULL AND NEW.valid_until >= public.today_mty() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'No se puede modificar valid_until de una cotizacion en estado %. Extiende la vigencia mientras este en draft, o deja que expire (sent -> expired) y rescatala a draft con una vigencia futura.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_overdue_supplier_bills()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.supplier_bills
     SET status = 'overdue', updated_at = now()
   WHERE status = 'pending'
     AND balance > 0
     AND due_date IS NOT NULL
     AND due_date < public.today_mty();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.supplier_bills
     SET status = 'pending', updated_at = now()
   WHERE status = 'overdue'
     AND (due_date IS NULL OR due_date >= public.today_mty());

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_supplier_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_due     DATE;
  v_current public.supplier_bill_status;
BEGIN
  SELECT total, status, due_date INTO v_total, v_current, v_due
    FROM public.supplier_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_current IN ('draft','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = p_bill_id;

  IF v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < public.today_mty() THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  PERFORM set_config('app.cxp_recalc', 'on', true);

  UPDATE public.supplier_bills
    SET balance = GREATEST(v_total - v_paid, 0),
        status  = v_status,
        updated_at = now()
    WHERE id = p_bill_id;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_released int := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  END IF;

  IF v_forklift IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  UPDATE public.forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift
     AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings
       WHERE forklift_id = v_forklift
         AND id IS DISTINCT FROM OLD.id
         AND status = 'confirmed'
         AND start_date <= public.today_mty()
         AND end_date   >= public.today_mty()
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available',
            'Reserva ' || COALESCE(OLD.booking_number, OLD.id::text) ||
            CASE WHEN TG_OP = 'DELETE' THEN ' eliminada' ELSE ' cancelada' END ||
            ': unidad liberada',
            auth.uid());
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'confirmed' AND NEW.start_date IS NOT NULL AND NEW.start_date <= public.today_mty() THEN
    UPDATE public.forklifts
       SET status = 'rented', updated_at = now()
     WHERE id = NEW.forklift_id
       AND status = 'available';
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, 'available', 'rented',
              'Reserva ' || COALESCE(NEW.booking_number, NEW.id::text) || ' confirmada (inicio inmediato)');
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
    FROM bookings b
    WHERE b.status = 'confirmed'
      AND public.today_mty() BETWEEN b.start_date AND b.end_date
  ),
  promote AS (
    UPDATE forklifts f
    SET status = 'rented', updated_at = now()
    FROM active a
    WHERE f.id = a.fid AND f.status = 'available'
    RETURNING f.id, 'available'::text AS prev, 'rented'::text AS newv
  ),
  demote AS (
    UPDATE forklifts f
    SET status = 'available', updated_at = now()
    WHERE f.status = 'rented'
      AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
    RETURNING f.id, 'rented'::text AS prev, 'available'::text AS newv
  )
  SELECT id, prev, newv FROM promote
  UNION ALL
  SELECT id, prev, newv FROM demote;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_supplier_bill_init_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('paid','partial','overdue','cancelled') THEN
      RAISE EXCEPTION 'No se puede crear una bill directamente en estado %. Registrala como pendiente y usa el flujo de pagos.', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.balance := COALESCE(NEW.total,0);
    IF NEW.status NOT IN ('draft','cancelled') THEN
      IF NEW.due_date IS NOT NULL AND NEW.due_date < public.today_mty() THEN
        NEW.status := 'overdue';
      ELSE
        NEW.status := 'pending';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_started_bookings_rented()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH started AS (
    SELECT DISTINCT ON (f.id)
      f.id AS forklift_id,
      b.booking_number
    FROM public.forklifts f
    JOIN public.bookings b ON b.forklift_id = f.id
    WHERE f.status = 'available'
      AND f.deleted_at IS NULL
      AND b.status NOT IN ('cancelled', 'completed')
      AND b.start_date <= public.today_mty()
      AND b.end_date >= public.today_mty()
    ORDER BY f.id, b.start_date
  ),
  updated AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM started s
     WHERE f.id = s.forklift_id
    RETURNING f.id, s.booking_number
  )
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  SELECT id, 'available', 'rented',
         'Reserva ' || booking_number || ' iniciada (materialización automática)'
  FROM updated;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_started_bookings_rented() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_started_bookings_rented() TO service_role;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'mark-started-bookings-rented-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'mark-started-bookings-rented-daily',
    '20 7 * * *',
    $cron$SELECT public.mark_started_bookings_rented();$cron$
  );
END $$;
-- ============================================================
-- R8-DB-01 (BL-R8-05 / BL-R8-09, P1): Recrear políticas RLS huérfanas.
-- ============================================================
DROP POLICY IF EXISTS "Mechanics read bookings" ON public.bookings;
CREATE POLICY "Mechanics read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

DROP POLICY IF EXISTS "Mechanics read booking_extensions" ON public.booking_extensions;
CREATE POLICY "Mechanics read booking_extensions" ON public.booking_extensions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'::public.app_role));

-- Alcance acotado a prospects: no se reabre el hueco de PII de 20260515040448 §9.
DROP POLICY IF EXISTS "Ventas read audit_logs" ON public.audit_logs;
CREATE POLICY "Ventas read audit_logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ventas'::public.app_role)
    AND table_name = 'prospects'
  );

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bookings'
      AND policyname = 'Mechanics read bookings' AND cmd = 'SELECT'
  ) THEN v_missing := array_append(v_missing, 'Mechanics read bookings'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_extensions'
      AND policyname = 'Mechanics read booking_extensions' AND cmd = 'SELECT'
  ) THEN v_missing := array_append(v_missing, 'Mechanics read booking_extensions'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
      AND policyname = 'Ventas read audit_logs' AND cmd = 'SELECT'
  ) THEN v_missing := array_append(v_missing, 'Ventas read audit_logs'); END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'R8-DB-01 falló: políticas no creadas: %', v_missing;
  END IF;
END $$;

-- ============================================================
-- R8-DB-02 (BL-R8-07, P1): Guardia server-side para cierre de OT.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_work_order_close_open_damage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.work_status = 'completed'
     AND OLD.work_status IS DISTINCT FROM 'completed' THEN
    IF EXISTS (
      SELECT 1
      FROM public.damage_records dr
      WHERE dr.maintenance_log_id = NEW.id
        AND dr.deleted_at IS NULL
        AND dr.status IN ('reported', 'in_repair')
    ) THEN
      RAISE EXCEPTION
        'No se puede cerrar la orden de trabajo: existen daños abiertos (reported/in_repair) ligados a esta OT. Marca los daños como reparados o elimínalos antes de cerrar.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_work_order_close_open_damage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_work_order_close_open_damage ON public.maintenance_logs;
CREATE TRIGGER trg_guard_work_order_close_open_damage
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_work_order_close_open_damage();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'maintenance_logs'
      AND t.tgname = 'trg_guard_work_order_close_open_damage'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'R8-DB-02 falló: trigger trg_guard_work_order_close_open_damage no creado';
  END IF;
END $$;

-- ============================================================
-- R8-DB-03 (BL-R8-01, P2): Diagnóstico CxP (solo lectura) + resync opt-in.
-- ============================================================
DO $$
DECLARE
  v_should_be_overdue integer;
  v_should_be_pending integer;
BEGIN
  SELECT count(*) INTO v_should_be_overdue
  FROM public.supplier_bills
  WHERE status = 'pending' AND balance > 0
    AND due_date IS NOT NULL AND due_date < CURRENT_DATE;

  SELECT count(*) INTO v_should_be_pending
  FROM public.supplier_bills
  WHERE status = 'overdue'
    AND (due_date IS NULL OR due_date >= CURRENT_DATE);

  RAISE NOTICE 'R8-DB-03 diagnóstico CxP: % pending que deberían ser overdue; % overdue que deberían ser pending.',
    v_should_be_overdue, v_should_be_pending;

  IF current_setting('app.cxp_resync', true) = 'on' THEN
    PERFORM public.mark_overdue_supplier_bills();
    RAISE NOTICE 'R8-DB-03: resync ejecutado.';
  END IF;
END $$;
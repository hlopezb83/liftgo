
-- 1) Add is_e2e column to activity_feed
ALTER TABLE public.activity_feed
  ADD COLUMN IF NOT EXISTS is_e2e boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_activity_feed_created_not_e2e
  ON public.activity_feed (created_at DESC)
  WHERE is_e2e = false;

-- 2) Update log_activity trigger to propagate is_e2e from source row
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_table text;
  v_title text;
  v_description text;
  v_uid uuid;
  v_actor_name text;
  v_actor_role public.app_role;
  v_row jsonb;
  v_is_e2e boolean := false;
BEGIN
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'Creación'
    WHEN 'UPDATE' THEN 'Actualización'
    WHEN 'DELETE' THEN 'Eliminación'
    ELSE TG_OP
  END;

  v_table := CASE TG_TABLE_NAME
    WHEN 'forklifts' THEN 'Montacargas'
    WHEN 'bookings' THEN 'Reservas'
    WHEN 'invoices' THEN 'Facturas'
    WHEN 'return_inspections' THEN 'Inspecciones de Devolución'
    WHEN 'maintenance_logs' THEN 'Mantenimiento'
    WHEN 'contracts' THEN 'Contratos'
    WHEN 'customers' THEN 'Clientes'
    WHEN 'deliveries' THEN 'Entregas'
    WHEN 'damage_records' THEN 'Registros de Daños'
    WHEN 'quotes' THEN 'Cotizaciones'
    WHEN 'payments' THEN 'Pagos'
    WHEN 'operating_expenses' THEN 'Gastos Operativos'
    WHEN 'prospects' THEN 'Prospectos'
    WHEN 'suppliers' THEN 'Proveedores'
    ELSE TG_TABLE_NAME
  END;

  v_title := v_action || ' de ' || v_table;

  v_description := CASE TG_OP
    WHEN 'INSERT' THEN 'Se creó un registro de ' || v_table
    WHEN 'UPDATE' THEN 'Se actualizó un registro de ' || v_table
    WHEN 'DELETE' THEN 'Se eliminó un registro de ' || v_table
    ELSE 'Operación en ' || v_table
  END;

  v_uid := auth.uid();

  IF v_uid IS NOT NULL THEN
    SELECT p.full_name INTO v_actor_name
    FROM public.profiles p
    WHERE p.user_id = v_uid OR p.id = v_uid
    LIMIT 1;

    SELECT ur.role INTO v_actor_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY CASE ur.role
      WHEN 'admin' THEN 1
      WHEN 'administrativo' THEN 2
      WHEN 'ventas' THEN 3
      WHEN 'dispatcher' THEN 4
      WHEN 'mechanic' THEN 5
      WHEN 'auditor' THEN 6
      ELSE 99
    END
    LIMIT 1;
  END IF;

  -- Detect is_e2e from source row (column may not exist on all audited tables)
  v_row := to_jsonb(COALESCE(NEW, OLD));
  IF v_row ? 'is_e2e' THEN
    v_is_e2e := COALESCE((v_row->>'is_e2e')::boolean, false);
  END IF;

  INSERT INTO public.activity_feed (
    event_type, entity_type, entity_id, title, description,
    actor_id, actor_name, actor_role, is_e2e
  )
  VALUES (
    TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    v_title, v_description,
    v_uid,
    COALESCE(v_actor_name, CASE WHEN v_uid IS NULL THEN 'Sistema' ELSE NULL END),
    v_actor_role,
    v_is_e2e
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3) Backfill: mark existing activity_feed rows from the E2E admin user
UPDATE public.activity_feed
SET is_e2e = true
WHERE actor_id = '47b14d44-caef-4ff1-bece-37883b060450'
  AND is_e2e = false;

-- 4) Backfill: mark rows whose entity belongs to an is_e2e record in the 7 E2E tables
UPDATE public.activity_feed af
SET is_e2e = true
WHERE af.is_e2e = false
  AND EXISTS (
    SELECT 1 FROM public.forklifts t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.customers t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.quotes t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.bookings t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.invoices t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.payments t WHERE t.id = af.entity_id AND t.is_e2e = true
    UNION ALL SELECT 1 FROM public.equipment_models t WHERE t.id = af.entity_id AND t.is_e2e = true
  );

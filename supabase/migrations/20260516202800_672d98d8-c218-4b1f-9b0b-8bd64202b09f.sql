-- 1) Add actor columns to activity_feed
ALTER TABLE public.activity_feed
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS actor_role public.app_role;

CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_created
  ON public.activity_feed (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_feed_created
  ON public.activity_feed (created_at DESC);

-- 2) Replace trigger function to capture actor
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_action text;
  v_table text;
  v_title text;
  v_description text;
  v_uid uuid;
  v_actor_name text;
  v_actor_role public.app_role;
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

  INSERT INTO public.activity_feed (
    event_type, entity_type, entity_id, title, description,
    actor_id, actor_name, actor_role
  )
  VALUES (
    TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    v_title, v_description,
    v_uid,
    COALESCE(v_actor_name, CASE WHEN v_uid IS NULL THEN 'Sistema' ELSE NULL END),
    v_actor_role
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3) Backfill historical entries from audit_logs (best-effort match by table+record+time)
UPDATE public.activity_feed af
SET
  actor_id = al.user_id,
  actor_name = COALESCE(p.full_name, af.actor_name),
  actor_role = COALESCE((
    SELECT ur.role FROM public.user_roles ur
    WHERE ur.user_id = al.user_id
    ORDER BY CASE ur.role
      WHEN 'admin' THEN 1 WHEN 'administrativo' THEN 2 WHEN 'ventas' THEN 3
      WHEN 'dispatcher' THEN 4 WHEN 'mechanic' THEN 5 WHEN 'auditor' THEN 6
      ELSE 99 END
    LIMIT 1
  ), af.actor_role)
FROM public.audit_logs al
LEFT JOIN public.profiles p ON p.user_id = al.user_id OR p.id = al.user_id
WHERE af.actor_id IS NULL
  AND al.table_name = af.entity_type
  AND al.record_id = af.entity_id
  AND al.created_at BETWEEN af.created_at - interval '2 seconds' AND af.created_at + interval '2 seconds';

-- 4) Mark remaining as 'Sistema' so UI can group them
UPDATE public.activity_feed
SET actor_name = 'Sistema'
WHERE actor_id IS NULL AND actor_name IS NULL;
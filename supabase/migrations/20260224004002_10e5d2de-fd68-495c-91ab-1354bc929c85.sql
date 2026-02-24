
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
BEGIN
  -- Traducir operación
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'Creación'
    WHEN 'UPDATE' THEN 'Actualización'
    WHEN 'DELETE' THEN 'Eliminación'
    ELSE TG_OP
  END;

  -- Traducir nombre de tabla
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
    ELSE TG_TABLE_NAME
  END;

  v_title := v_action || ' de ' || v_table;

  v_description := CASE TG_OP
    WHEN 'INSERT' THEN 'Se creó un registro de ' || v_table
    WHEN 'UPDATE' THEN 'Se actualizó un registro de ' || v_table
    WHEN 'DELETE' THEN 'Se eliminó un registro de ' || v_table
    ELSE 'Operación en ' || v_table
  END;

  INSERT INTO public.activity_feed (event_type, entity_type, entity_id, title, description)
  VALUES (
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_title,
    v_description
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

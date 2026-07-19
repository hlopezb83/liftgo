CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_allowed_tables text[] := ARRAY[
    'forklifts', 'customers', 'contracts', 'deliveries',
    'maintenance_logs', 'damage_records', 'quotes', 'return_inspections'
  ];
  v_financial_tables text[] := ARRAY['bookings', 'invoices', 'payments'];
  v_key text;
  v_sets text := '';
  v_first boolean := true;
  v_revert_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can revert audit logs';
  END IF;

  SELECT * INTO v_log FROM audit_logs WHERE id = p_audit_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit log not found';
  END IF;

  IF v_log.table_name = ANY(v_financial_tables) THEN
    RAISE EXCEPTION 'Las operaciones financieras (%) se reversan por sus flujos de negocio (cancelación SAT, notas de crédito, eliminación de pago con re-sync), no por la bitácora.', v_log.table_name;
  END IF;

  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  CASE v_log.action
    WHEN 'INSERT' THEN
      EXECUTE format('DELETE FROM %I WHERE id = %L', v_log.table_name, v_log.record_id);

    WHEN 'UPDATE' THEN
      FOR v_key IN SELECT jsonb_object_keys(v_log.old_values) LOOP
        IF NOT v_first THEN v_sets := v_sets || ', '; END IF;
        v_sets := v_sets || format('%I = %L', v_key, v_log.old_values->>v_key);
        v_first := false;
      END LOOP;
      IF v_sets <> '' THEN
        EXECUTE format('UPDATE %I SET %s WHERE id = %L', v_log.table_name, v_sets, v_log.record_id);
      END IF;

    WHEN 'DELETE' THEN
      RAISE EXCEPTION 'Cannot revert DELETE operations automatically';
  END CASE;

  INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, user_id)
  VALUES (
    v_log.table_name,
    v_log.record_id,
    'REVERT',
    v_log.new_values,
    v_log.old_values,
    auth.uid()
  )
  RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$function$;

COMMENT ON FUNCTION public.revert_audit_log(uuid) IS
  'BL-47: revierte cambios auditados en tablas no financieras. Bookings/invoices/payments quedan explícitamente excluidos y deben reversarse por sus flujos de negocio para mantener saldos y estatus consistentes.';
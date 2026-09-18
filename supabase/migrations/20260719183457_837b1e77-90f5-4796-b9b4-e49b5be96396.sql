DROP POLICY IF EXISTS "Admins full access audit_logs" ON public.audit_logs;

CREATE POLICY "Admins read audit_logs"
  ON public.audit_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.enforce_audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.audit_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (op=%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_logs_immutable();

DROP FUNCTION IF EXISTS public.revert_audit_log(uuid);

CREATE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_allowed_tables text[] := ARRAY[
    'bookings', 'invoices', 'forklifts', 'customers', 'contracts',
    'payments', 'deliveries', 'maintenance_logs', 'damage_records',
    'quotes', 'return_inspections'
  ];
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

  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  CASE v_log.action
    WHEN 'INSERT' THEN
      EXECUTE format('DELETE FROM %I WHERE id = %L', v_log.table_name, v_log.record_id);

    WHEN 'UPDATE' THEN
      IF v_log.old_data IS NULL THEN
        RAISE EXCEPTION 'Cannot revert UPDATE: no old_data available';
      END IF;
      FOR v_key IN SELECT jsonb_object_keys(v_log.old_data)
      LOOP
        IF v_key NOT IN ('id', 'created_at') THEN
          IF v_first THEN v_first := false; ELSE v_sets := v_sets || ', '; END IF;
          v_sets := v_sets || format('%I = %L', v_key, v_log.old_data ->> v_key);
        END IF;
      END LOOP;
      IF v_sets <> '' THEN
        EXECUTE format('UPDATE %I SET %s WHERE id = %L', v_log.table_name, v_sets, v_log.record_id);
      END IF;

    WHEN 'DELETE' THEN
      IF v_log.old_data IS NULL THEN
        RAISE EXCEPTION 'Cannot revert DELETE: no old_data available';
      END IF;
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, %L::jsonb)',
        v_log.table_name, v_log.table_name, v_log.old_data::text
      );

    ELSE
      RAISE EXCEPTION 'Unknown action: %', v_log.action;
  END CASE;

  INSERT INTO public.audit_logs (
    user_id, table_name, record_id, action, old_data, new_data, changed_fields
  ) VALUES (
    auth.uid(),
    v_log.table_name,
    v_log.record_id,
    'REVERT',
    v_log.new_data,
    v_log.old_data,
    jsonb_build_object('source_audit_log_id', p_audit_log_id)
  ) RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revert_audit_log(uuid) TO authenticated;

COMMENT ON FUNCTION public.revert_audit_log(uuid) IS
  'BL-39: revierte una operación auditada dejando el log original intacto y agregando una entrada compensatoria con action=REVERT y changed_fields.source_audit_log_id.';
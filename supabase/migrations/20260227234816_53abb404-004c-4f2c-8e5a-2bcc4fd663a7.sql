
CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  -- Only admins can revert
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can revert audit logs';
  END IF;

  -- Fetch the audit log entry
  SELECT * INTO v_log FROM audit_logs WHERE id = p_audit_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit log not found';
  END IF;

  -- Validate table is in whitelist
  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  -- Execute revert based on action type
  CASE v_log.action
    WHEN 'INSERT' THEN
      -- Revert INSERT = delete the created record
      EXECUTE format('DELETE FROM %I WHERE id = %L', v_log.table_name, v_log.record_id);

    WHEN 'UPDATE' THEN
      -- Revert UPDATE = restore old_data values
      IF v_log.old_data IS NULL THEN
        RAISE EXCEPTION 'Cannot revert UPDATE: no old_data available';
      END IF;
      -- Build SET clause from old_data keys
      FOR v_key IN SELECT jsonb_object_keys(v_log.old_data)
      LOOP
        IF v_key NOT IN ('id', 'created_at') THEN
          IF v_first THEN
            v_first := false;
          ELSE
            v_sets := v_sets || ', ';
          END IF;
          v_sets := v_sets || format('%I = %L', v_key, v_log.old_data ->> v_key);
        END IF;
      END LOOP;
      IF v_sets != '' THEN
        EXECUTE format('UPDATE %I SET %s WHERE id = %L', v_log.table_name, v_sets, v_log.record_id);
      END IF;

    WHEN 'DELETE' THEN
      -- Revert DELETE = re-insert using old_data
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

  -- Delete the audit log entry
  DELETE FROM audit_logs WHERE id = p_audit_log_id;
END;
$$;

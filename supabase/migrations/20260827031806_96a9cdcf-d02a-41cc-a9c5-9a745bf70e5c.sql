-- FIX R5-05: revert_audit_log fijaba app.audit_revert='on' ANTES de las
-- validaciones de existencia/bloqueo optimista que hacen RAISE dentro del
-- CASE. Si alguna fallaba, el bypass quedaba activo el resto de la
-- transaccion, deshabilitando los guards de transicion/terminal.
CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_allowed_tables text[] := ARRAY['forklifts','customers','contracts','deliveries','maintenance_logs','damage_records','quotes','return_inspections'];
  v_financial_tables text[] := ARRAY['bookings','invoices','payments'];
  v_key text; v_sets text := ''; v_first boolean := true; v_revert_id uuid;
  v_current jsonb;
  v_mismatch text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can revert audit logs';
  END IF;

  SELECT * INTO v_log FROM audit_logs WHERE id = p_audit_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit log not found'; END IF;

  IF v_log.table_name = ANY(v_financial_tables) THEN
    RAISE EXCEPTION 'Las operaciones financieras (%) se reversan por sus flujos de negocio (cancelación SAT, notas de crédito, eliminación de pago con re-sync), no por la bitácora.', v_log.table_name;
  END IF;

  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  -- R4-19: bypass de los guards de transicion/terminal durante la restauracion.
  PERFORM set_config('app.audit_revert', 'on', true);

  -- FIX R5-05: cualquier RAISE dentro del CASE (registro eliminado,
  -- bloqueo optimista, DELETE no revertible) resetea el bypass antes
  -- de propagar el error.
  BEGIN
    CASE v_log.action
      WHEN 'INSERT' THEN
        EXECUTE format('DELETE FROM %I WHERE id = %L', v_log.table_name, v_log.record_id);
      WHEN 'UPDATE' THEN
        -- N-18: bloqueo optimista antes de restaurar old_data.
        EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = %L', v_log.table_name, v_log.record_id)
          INTO v_current;
        IF v_current IS NULL THEN
          RAISE EXCEPTION 'No se puede revertir: el registro % de % ya no existe (fue eliminado despues del cambio registrado).',
            v_log.record_id, v_log.table_name;
        END IF;
        IF v_log.new_data ? 'updated_at' AND v_current ? 'updated_at' THEN
          IF v_current->>'updated_at' IS DISTINCT FROM v_log.new_data->>'updated_at' THEN
            RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado. Revierta primero los cambios posteriores.',
              v_log.record_id, v_log.table_name;
          END IF;
        ELSE
          v_mismatch := NULL;
          FOR v_key IN SELECT jsonb_object_keys(v_log.new_data) LOOP
            IF v_current->v_key IS DISTINCT FROM v_log.new_data->v_key THEN
              v_mismatch := v_key;
              EXIT;
            END IF;
          END LOOP;
          IF v_mismatch IS NOT NULL THEN
            RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado (el campo "%" ya no coincide). Revierta primero los cambios posteriores.',
              v_log.record_id, v_log.table_name, v_mismatch;
          END IF;
        END IF;
        FOR v_key IN SELECT jsonb_object_keys(v_log.old_data) LOOP
          IF NOT v_first THEN v_sets := v_sets || ', '; END IF;
          v_sets := v_sets || format('%I = %L', v_key, v_log.old_data->>v_key);
          v_first := false;
        END LOOP;
        IF v_sets <> '' THEN
          EXECUTE format('UPDATE %I SET %s WHERE id = %L', v_log.table_name, v_sets, v_log.record_id);
        END IF;
      WHEN 'DELETE' THEN
        RAISE EXCEPTION 'Cannot revert DELETE operations automatically';
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.audit_revert', 'off', true);
    RAISE;
  END;

  -- R4-19: reset del bypass al terminar la restauracion.
  PERFORM set_config('app.audit_revert', 'off', true);

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (v_log.table_name, v_log.record_id, 'REVERT', v_log.new_data, v_log.old_data, auth.uid())
  RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$function$;
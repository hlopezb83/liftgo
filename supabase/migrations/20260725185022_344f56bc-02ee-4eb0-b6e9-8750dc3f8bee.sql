-- Tanda 2 P1-4: excluir columnas grandes del snapshot de auditoría.
-- Motivo: cada UPDATE/DELETE sobre una factura timbrada duplicaba ~10 KB
-- de cfdi_xml en audit_logs, inflando payloads y coste de stringify en /audit.
-- Columnas excluidas:
--   - cfdi_xml, cfdi_xml_url  → XML fiscal completo (invoices)
--   - content                 → texto largo de contratos
--   - xml_content             → XML de facturas de proveedor (histórico)
--   - line_items              → JSONB de partidas (varias tablas)
-- Nota: `changed_fields` sigue detectando cambios sobre el JSONB completo;
-- sólo el snapshot persistido se recorta.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_key text;
  v_user_id uuid;
  v_email text;
  v_is_e2e_actor boolean := false;
BEGIN
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      IF v_email IS NOT NULL AND (v_email ILIKE 'e2e-%@%' OR v_email ILIKE '%@liftgo.test') THEN
        v_is_e2e_actor := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_e2e_actor := false;
    END;
  END IF;

  IF v_is_e2e_actor THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) THEN
      RETURN NEW;
    END IF;
    v_new := to_jsonb(NEW)
      - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND (
      ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE)
      OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)
    ) THEN
      RETURN NEW;
    END IF;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new)
    LOOP
      IF v_key NOT IN ('updated_at', 'created_at') AND
         (v_old->v_key IS DISTINCT FROM v_new->v_key) THEN
        v_changed := v_changed || v_key;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      -- Recortar snapshots después de calcular changed_fields (para no perder
      -- la señal de que un XML/JSONB cambió).
      v_old := v_old - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := v_new - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN
      RETURN OLD;
    END IF;
    v_old := to_jsonb(OLD)
      - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_user_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;
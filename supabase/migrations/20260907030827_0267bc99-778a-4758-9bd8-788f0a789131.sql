-- Bug 3 (v7.422.0) · endurecimiento en DB: la justificación para completar
-- una entrega sin operador ni firma vivía sólo en React. Invariante mínima:
--   INSERT ya 'completed'  ó  UPDATE con transición → 'completed'
--   y driver_name / signature_base64 vacíos  ⇒  completed_no_evidence_reason
--   debe tener contenido.
-- Históricos: una fila que YA estaba completed (OLD.status = 'completed') no
-- se evalúa; sus ediciones futuras (notas, costos, etc.) siguen permitidas
-- aunque carezca de evidencia. Sin backfill ni cambios de datos.

CREATE OR REPLACE FUNCTION public.enforce_delivery_completed_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- R4-19: no interferir con la reversión administrativa de bitácora.
  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
     AND NULLIF(btrim(NEW.driver_name), '') IS NULL
     AND NULLIF(btrim(NEW.signature_base64), '') IS NULL
     AND NULLIF(btrim(NEW.completed_no_evidence_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Para completar una entrega sin operador ni firma debes capturar una justificación breve.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'deliveries_completed_evidence_required',
            HINT = 'Asigna un operador, captura la firma del cliente o escribe quién autorizó la entrega.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_delivery_completed_evidence() IS
  'Bug 3 · Entrega completada (alta o transición) sin operador ni firma exige completed_no_evidence_reason. No evalúa filas que ya estaban completed (históricos intactos).';

DROP TRIGGER IF EXISTS trg_delivery_completed_evidence ON public.deliveries;
CREATE TRIGGER trg_delivery_completed_evidence
  BEFORE INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_completed_evidence();
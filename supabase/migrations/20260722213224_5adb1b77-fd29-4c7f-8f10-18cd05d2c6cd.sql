
-- =====================================================================
-- R8 · v7.189.0 · Business invariants for quotes, forklift status & equipment models
-- =====================================================================

-- B2 · Guard cotizaciones vencidas ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted'
     AND (OLD.status IS DISTINCT FROM 'accepted')
     AND NEW.valid_until IS NOT NULL
     AND NEW.valid_until < current_date THEN
    RAISE EXCEPTION 'No se puede aceptar una cotización vencida (valid_until=%)', NEW.valid_until
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_guard_acceptance ON public.quotes;
CREATE TRIGGER quotes_guard_acceptance
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_quote_acceptance();


-- B3 · RPC validador de cambio de estado de flota ------------------------------------
CREATE OR REPLACE FUNCTION public.change_forklift_status(
  p_forklift_id uuid,
  p_new_status  text,
  p_reason      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current         text;
  v_active_bookings int;
BEGIN
  SELECT status INTO v_current
    FROM public.forklifts
   WHERE id = p_forklift_id
   FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;

  IF v_current = p_new_status THEN
    RETURN;
  END IF;

  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;

  SELECT count(*)
    INTO v_active_bookings
    FROM public.bookings
   WHERE forklift_id = p_forklift_id
     AND status = 'confirmed';

  -- 'rented' se deriva del sistema, no se setea a mano.
  IF p_new_status = 'rented' AND v_active_bookings = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;

  -- Salir de 'rented' con renta activa: prohibido.
  IF v_current = 'rented'
     AND p_new_status IN ('maintenance','available','sold','retired')
     AND v_active_bookings > 0 THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado';
  END IF;

  -- Razón obligatoria para maintenance/sold/retired.
  IF p_new_status IN ('maintenance','sold','retired')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;

  UPDATE public.forklifts SET status = p_new_status WHERE id = p_forklift_id;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_current, p_new_status, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.change_forklift_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_forklift_status(uuid, text, text) TO authenticated;


-- B5 · Unique fabricante+modelo en equipment_models ----------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS equipment_models_mfr_model_unique
ON public.equipment_models (lower(manufacturer), lower(model));

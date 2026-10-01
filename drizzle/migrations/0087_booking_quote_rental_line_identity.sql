-- COM-01: persist the accepted rental_meta line identity at booking creation.
-- Integrate into migration 0087. Historical bookings remain NULL and continue
-- through the conservative legacy ambiguity guard in quotedRentalAllocation.ts.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quote_rental_line_index integer;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_quote_rental_line_index_nonnegative
  CHECK (quote_rental_line_index IS NULL OR quote_rental_line_index >= 0);

CREATE OR REPLACE FUNCTION public.assign_booking_quote_rental_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_model_id uuid;
  v_forklift_org uuid;
  v_line_index integer;
  v_meta jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.quote_rental_line_index IS DISTINCT FROM OLD.quote_rental_line_index
       OR (OLD.quote_rental_line_index IS NOT NULL AND
           (NEW.quote_id IS DISTINCT FROM OLD.quote_id OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id)) THEN
      RAISE EXCEPTION 'La identidad de la partida cotizada de una reserva no se puede cambiar.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.quote_rental_line_index IS NOT NULL THEN
    RAISE EXCEPTION 'La identidad de partida se asigna en el servidor.' USING ERRCODE = '23514';
  END IF;
  IF NEW.quote_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = NEW.quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF; -- the FK reports an absent quote
  IF jsonb_typeof(v_quote.rental_meta) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_quote.rental_meta) = 0 THEN RETURN NEW; END IF;

  SELECT equipment_model_id, organization_id INTO v_model_id, v_forklift_org
    FROM public.forklifts WHERE id = NEW.forklift_id;
  IF v_model_id IS NULL OR v_forklift_org IS DISTINCT FROM v_quote.organization_id THEN
    RAISE EXCEPTION 'La unidad no corresponde a la organización y modelo cotizados.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.quote_id = NEW.quote_id AND b.status <> 'cancelled'
       AND b.quote_rental_line_index IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay reservas previas sin identidad de partida; requiere revisión.'
      USING ERRCODE = '23514';
  END IF;

  -- convert_quote_to_bookings locks this same quote and consumes model slots
  -- in source order. The first unoccupied slot is therefore its exact slot,
  -- even when two lines share a model but have different prices/discounts.
  SELECT (m.ord - 1)::integer, m.meta INTO v_line_index, v_meta
    FROM jsonb_array_elements(v_quote.rental_meta) WITH ORDINALITY AS m(meta, ord)
   WHERE m.meta->>'modelId' = v_model_id::text
     AND (
       SELECT count(*) FROM public.bookings b
        WHERE b.quote_id = NEW.quote_id AND b.status <> 'cancelled'
          AND b.quote_rental_line_index = m.ord - 1
     ) < GREATEST(COALESCE((m.meta->>'quantity')::integer, 1), 1)
   ORDER BY m.ord
   LIMIT 1;
  IF v_line_index IS NULL THEN
    RAISE EXCEPTION 'No queda una partida cotizada disponible para la unidad.'
      USING ERRCODE = '23514';
  END IF;
  -- JSON strings such as "NaN", nulls, negatives and non-numeric rates must
  -- never become an authoritative source for a billed reservation.
  IF jsonb_typeof(v_meta->'quantity') IS DISTINCT FROM 'number'
     OR (v_meta->>'quantity')::numeric < 1
     OR (v_meta->>'quantity')::numeric <> trunc((v_meta->>'quantity')::numeric)
     OR EXISTS (
       SELECT 1 FROM (VALUES ('dailyRate'), ('weeklyRate'), ('monthlyRate')) AS r(key)
        WHERE jsonb_typeof(v_meta->r.key) IS DISTINCT FROM 'number'
           OR (v_meta->>r.key)::numeric < 0
           OR (v_meta->>r.key)::numeric = 'NaN'::numeric
     ) THEN
    RAISE EXCEPTION 'La partida de renta contiene cantidad o tarifas inválidas.'
      USING ERRCODE = '23514';
  END IF;
  NEW.quote_rental_line_index := v_line_index;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_booking_quote_rental_line() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_assign_booking_quote_rental_line ON public.bookings;
CREATE TRIGGER trg_assign_booking_quote_rental_line
  BEFORE INSERT OR UPDATE OF quote_rental_line_index, quote_id, forklift_id
  ON public.bookings FOR EACH ROW
  EXECUTE FUNCTION public.assign_booking_quote_rental_line();


ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_reason text NULL,
  ADD COLUMN IF NOT EXISTS final_amount numeric NULL;

CREATE OR REPLACE FUNCTION public.validate_prospect_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'cerrado_perdido' AND (NEW.lost_reason IS NULL OR length(trim(NEW.lost_reason)) = 0) THEN
    RAISE EXCEPTION 'Razón de pérdida requerida al marcar como Cerrado Perdido';
  END IF;
  IF NEW.stage IN ('cerrado_ganado','cerrado_perdido') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.stage NOT IN ('cerrado_ganado','cerrado_perdido') THEN
    NEW.closed_at := NULL;
    NEW.lost_reason := NULL;
    NEW.final_amount := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospects_validate_close ON public.prospects;
CREATE TRIGGER prospects_validate_close
  BEFORE INSERT OR UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_prospect_close();

CREATE INDEX IF NOT EXISTS idx_prospects_closed_at ON public.prospects (closed_at DESC) WHERE closed_at IS NOT NULL;

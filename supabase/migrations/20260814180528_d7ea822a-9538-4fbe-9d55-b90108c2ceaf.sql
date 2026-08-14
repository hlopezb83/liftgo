ALTER TABLE public.prospects ALTER COLUMN stage_order DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.assign_prospect_stage_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stage_order IS NULL THEN
    NEW.stage_order := public.next_stage_order(NEW.stage);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_prospect_stage_order ON public.prospects;
CREATE TRIGGER trg_assign_prospect_stage_order
  BEFORE INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.assign_prospect_stage_order();
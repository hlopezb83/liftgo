
ALTER TABLE public.prospects
  ADD COLUMN created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION set_prospect_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_prospect_created_by
  BEFORE INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION set_prospect_created_by();

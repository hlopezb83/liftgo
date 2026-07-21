-- BLOQUE 1.1: elimina el overload viejo de create_booking(7 args) para que
-- PostgREST no pueda saltarse los fixes de la firma de 8 args.
DROP FUNCTION IF EXISTS public.create_booking(
  uuid, uuid, text, text, date, date, boolean
);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_booking';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'create_booking debe tener exactamente 1 sobrecarga, encontradas: %', v_count;
  END IF;
END $$;
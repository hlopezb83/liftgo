-- Assertion-only receipt for the reviewed 0109 activation.
-- The official runner applies pending 0109 first and records this file last.
-- No business writes, function replacement, grants or manual ledger changes.
DO $control0109$
DECLARE
  v_prefix text;
  v_proc record;
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 111
     OR (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE id <= 111) <> 110 THEN
    RAISE EXCEPTION 'control0109: unexpected ledger size';
  END IF;
  SELECT encode(sha256(convert_to(string_agg(
    id::text || ':' || created_at::text || ':' || hash, E'\n' ORDER BY id),
    'UTF8')), 'hex') INTO v_prefix
  FROM drizzle.__drizzle_migrations WHERE id <= 111;
  IF v_prefix IS DISTINCT FROM
     '5f41f1ebbf42984335940bc78d25693b6648dda2ebb98b726872d139374176f1' THEN
    RAISE EXCEPTION 'control0109: historical prefix changed';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations
      WHERE id > 111 AND created_at = 1792450926544
        AND hash = '40c107198c010772eb21a922df34bb333920ba9defd497aefa0abbcfdc393edb') <> 1 THEN
    RAISE EXCEPTION 'control0109: missing or different 0109';
  END IF;
  SELECT p.*, pg_get_userbyid(p.proowner) AS owner_name
    INTO STRICT v_proc FROM pg_proc p
    WHERE p.oid = 'public.sync_invoice_bookings(uuid,uuid[])'::regprocedure;
  IF v_proc.owner_name IS DISTINCT FROM 'postgres'
     OR v_proc.prosecdef
     OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR v_proc.prorettype <> 'integer'::regtype
     OR v_proc.proretset
     OR v_proc.proargnames IS DISTINCT FROM ARRAY['p_invoice_id','p_booking_ids']::text[]
     OR v_proc.proacl::text IS DISTINCT FROM
       '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_zxefrzfaynnfwazqhwxp=X/postgres}'
     OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex') IS DISTINCT FROM
       'bc44b595801fedbc061d29a148e5afe7b1659dc0737b9b97fb253274ee687e79'
     OR has_function_privilege('anon',v_proc.oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_proc.oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_proc.oid,'EXECUTE') THEN
    RAISE EXCEPTION 'control0109: function body, contract or ACL changed';
  END IF;
END
$control0109$;

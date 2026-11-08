-- Assertion-only receipt: after 0132 registration, before this receipt's registration.
-- UTF-8 with LF; no function invocation, DDL, DML, ACL changes or ledger writes.
DO $control$
DECLARE
  n bigint;
  h text;
  r record;
  c record;
BEGIN
  SELECT count(*),
    encode(sha256(convert_to(string_agg(
      id::text || ':' || created_at::text || ':' || hash,
      chr(10) ORDER BY id), 'UTF8')), 'hex')
  INTO n, h
  FROM drizzle.__drizzle_migrations
  WHERE created_at < 1794171600000;

  IF n IS DISTINCT FROM 133 OR h IS DISTINCT FROM
    '57af863f38394b547dd88020883c1df2d58ceabf5ba8d077a571a8402d41089f' THEN
    RAISE EXCEPTION 'control0132: historical ledger changed';
  END IF;

  SELECT count(*) INTO n FROM drizzle.__drizzle_migrations;
  IF n IS DISTINCT FROM 134 THEN
    RAISE EXCEPTION 'control0132: expected 134 ledger rows, found %', n;
  END IF;

  SELECT count(*) INTO n FROM drizzle.__drizzle_migrations
  WHERE created_at = 1794171600000
    AND hash = 'f670704eee1b2bd41393240962b08b0e3237998868a8457fc10cb46ac23276a2';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'control0132: missing or duplicate 0132 ledger entry';
  END IF;

  IF (SELECT id FROM drizzle.__drizzle_migrations
      WHERE created_at = 1794171600000)
     IS DISTINCT FROM (SELECT max(id) FROM drizzle.__drizzle_migrations) THEN
    RAISE EXCEPTION 'control0132: ledger order';
  END IF;

  IF current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
    RAISE EXCEPTION 'control0132: encoding';
  END IF;

  SELECT pc.collprovider, pc.collisdeterministic, pc.collversion,
    pg_collation_actual_version(pc.oid) AS actual_version,
    coalesce(to_jsonb(pc)->>'colllocale',
             to_jsonb(pc)->>'colliculocale') AS locale
  INTO c FROM pg_catalog.pg_collation pc
  WHERE pc.oid = to_regcollation('public.quotes_natural_order');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'control0132: missing collation';
  END IF;
  IF c.collprovider IS DISTINCT FROM 'i'
     OR c.collisdeterministic IS DISTINCT FROM false
     OR c.locale IS DISTINCT FROM 'und-u-kn-ks-level1'
     OR c.collversion IS DISTINCT FROM '153.120'
     OR c.actual_version IS DISTINCT FROM '153.120' THEN
    RAISE EXCEPTION 'control0132: collation contract';
  END IF;

  SELECT p.* INTO r FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure(
    'public.get_inventory_page(uuid,text,text,integer,integer,jsonb)');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'control0132: missing function signature';
  END IF;

  IF pg_get_userbyid(r.proowner) IS DISTINCT FROM 'postgres'
     OR (SELECT lanname FROM pg_catalog.pg_language WHERE oid = r.prolang)
        IS DISTINCT FROM 'plpgsql'
     OR r.prokind::text IS DISTINCT FROM 'f'
     OR r.provolatile::text IS DISTINCT FROM 's'
     OR r.prosecdef IS DISTINCT FROM false
     OR r.proisstrict IS DISTINCT FROM false
     OR r.pronargs IS DISTINCT FROM 6
     OR r.pronargdefaults IS DISTINCT FROM 5
     OR r.proargnames IS DISTINCT FROM ARRAY[
       'p_expected_organization_id','p_search','p_category',
       'p_page','p_page_size','p_sort']::text[]
     OR r.proargmodes IS NOT NULL OR r.proallargtypes IS NOT NULL
     OR pg_get_expr(r.proargdefaults, 0) IS DISTINCT FROM
        $defaults$NULL::text, 'all'::text, 0, 25, '[]'::jsonb$defaults$
     OR r.proretset IS DISTINCT FROM false
     OR r.prorettype IS DISTINCT FROM to_regtype('pg_catalog.jsonb')
     OR r.proconfig IS DISTINCT FROM
        ARRAY['search_path=pg_catalog, public']::text[]
     OR encode(sha256(convert_to(r.prosrc, 'UTF8')), 'hex') IS DISTINCT FROM
        '9e8349eee7e19ba3559ec6100d0ac05485261321f383f00174cb3a0062fa3581' THEN
    RAISE EXCEPTION 'control0132: function contract';
  END IF;

  IF EXISTS (
    SELECT 1 FROM aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'control0132: PUBLIC execute';
  END IF;
  IF has_function_privilege('anon', r.oid, 'EXECUTE') IS DISTINCT FROM false
     OR has_function_privilege('service_role', r.oid, 'EXECUTE') IS DISTINCT FROM false
     OR has_function_privilege('authenticated', r.oid, 'EXECUTE') IS DISTINCT FROM true
     OR has_function_privilege('authenticated', r.oid, 'EXECUTE WITH GRANT OPTION') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'control0132: effective execute contract';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a
    WHERE a.grantee = 'authenticated'::regrole
      AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
  ) OR EXISTS (
    SELECT 1 FROM aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a
    WHERE a.grantee IN ('anon'::regrole, 'service_role'::regrole)
  ) THEN
    RAISE EXCEPTION 'control0132: explicit ACL contract';
  END IF;
END
$control$;

-- Assertion-only release receipt. Run after 0129/0130 ledger registration, before this receipt's registration.
-- Historical fingerprint uses LF (chr(10)); no DDL, DML, grants or role changes occur here.
DO $control$
DECLARE
  r record;
  c record;
  t record;
  e record;
  f record;
  n bigint;
  h text;
BEGIN
  SELECT count(*),
    encode(sha256(convert_to(string_agg(
      id::text || ':' || created_at::text || ':' || hash,
      chr(10) ORDER BY id), 'UTF8')), 'hex')
  INTO n, h
  FROM drizzle.__drizzle_migrations
  WHERE created_at <= 1794081979795;

  IF n <> 130 OR h IS DISTINCT FROM
    'e1bea794dae690752df3db8401baf41f517afe708bee9857d9894e7b4acf067a' THEN
    RAISE EXCEPTION 'control0129_0130: historical ledger changed';
  END IF;

  SELECT count(*) INTO n FROM drizzle.__drizzle_migrations;
  IF n <> 132 THEN
    RAISE EXCEPTION 'control0129_0130: expected 132 ledger rows, found %', n;
  END IF;

  FOR e IN
    SELECT * FROM (VALUES
      (1794132000000::bigint,
       '11bd425b48ef7685ea5558cc91280160cd59edb03cc54fa9b35fff79eab6b9aa'::text),
      (1794153218000::bigint,
       '646fede0b54cf4ba8ed7dd34ec4a8ce251c0fcbca660832792dddc7dc0af0405'::text)
    ) AS expected(ts, hash)
  LOOP
    SELECT count(*) INTO n FROM drizzle.__drizzle_migrations
    WHERE created_at = e.ts AND hash = e.hash;
    IF n <> 1 THEN
      RAISE EXCEPTION 'control0129_0130: missing or duplicate ledger entry %', e.ts;
    END IF;
  END LOOP;

  IF (SELECT id FROM drizzle.__drizzle_migrations
      WHERE created_at = 1794132000000)
     >= (SELECT id FROM drizzle.__drizzle_migrations
         WHERE created_at = 1794153218000) THEN
    RAISE EXCEPTION 'control0129_0130: ledger order';
  END IF;

  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'control0129_0130: encoding';
  END IF;

  SELECT pc.collprovider, pc.collisdeterministic, pc.collversion,
    pg_collation_actual_version(pc.oid) AS actual_version,
    coalesce(to_jsonb(pc)->>'colllocale',
             to_jsonb(pc)->>'colliculocale') AS locale
  INTO c FROM pg_catalog.pg_collation pc
  WHERE pc.oid = to_regcollation('public.quotes_natural_order');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'control0129_0130: missing collation';
  END IF;
  IF c.collprovider IS DISTINCT FROM 'i'
     OR c.collisdeterministic IS DISTINCT FROM false
     OR c.locale IS DISTINCT FROM 'und-u-kn-ks-level1'
     OR c.collversion IS DISTINCT FROM '153.120'
     OR c.actual_version IS DISTINCT FROM c.collversion THEN
    RAISE EXCEPTION 'control0129_0130: collation contract';
  END IF;

  FOR f IN
    SELECT * FROM (VALUES
      ('normalize_quote_search',
       'public.normalize_quote_search(text)',
       '8ee06db84534f64a2e3d440dd47d1b9c862d0ef3ebd2bc52cccb9cff56d8ad98',
       'sql', 'i', false, true, 1, 0, 'text',
       'search_path=pg_catalog, public', ARRAY['p_value']::text[], NULL::text),
      ('get_quotes_page',
       'public.get_quotes_page(uuid,text,text,integer,integer,jsonb)',
       '671d21624df20849f5e631c8384429d28df7d36aee152b79d946c10266b15a66',
       'plpgsql', 's', false, false, 6, 5, 'jsonb',
       'search_path=pg_catalog, public',
       ARRAY['p_expected_organization_id','p_search','p_status','p_page','p_page_size','p_sort']::text[],
       $defaults$NULL::text, 'all'::text, 0, 25, '[]'::jsonb$defaults$::text),
      ('guard_sale_quote_invoice_uniqueness',
       'public.guard_sale_quote_invoice_uniqueness()',
       '6d5300f72996465ae526e78a9a807286e3fe391ffa57d6005ae21d5db19a4017',
       'plpgsql', 'v', true, false, 0, 0, 'trigger',
       'search_path=public, pg_temp', NULL::text[], NULL::text)
    ) AS expected(name, signature, body_hash, language, volatility,
                  definer, is_strict, nargs, defaults, return_type, config, arg_names, defaults_sql)
  LOOP
    -- Inspect only the exact migration signatures; unrelated overloads are not owned by this receipt.
    SELECT p.* INTO r FROM pg_proc p
    WHERE p.oid = to_regprocedure(f.signature);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'control0129_0130: missing signature %', f.signature;
    END IF;

    IF pg_get_userbyid(r.proowner) <> 'postgres'
       OR (SELECT lanname FROM pg_language WHERE oid = r.prolang) <> f.language
       OR r.prokind::text <> 'f'
       OR r.provolatile::text <> f.volatility
       OR r.prosecdef IS DISTINCT FROM f.definer
       OR r.proisstrict IS DISTINCT FROM f.is_strict
       OR r.pronargs <> f.nargs OR r.pronargdefaults <> f.defaults
       OR r.proargnames IS DISTINCT FROM f.arg_names
       OR r.proargmodes IS NOT NULL OR r.proallargtypes IS NOT NULL
       OR pg_get_expr(r.proargdefaults, 0) IS DISTINCT FROM f.defaults_sql
       OR r.proretset
       OR r.prorettype <> to_regtype(f.return_type)
       OR r.proconfig IS DISTINCT FROM ARRAY[f.config]::text[]
       OR encode(sha256(convert_to(r.prosrc, 'UTF8')), 'hex') <> f.body_hash THEN
      RAISE EXCEPTION 'control0129_0130: function contract %', f.name;
    END IF;

    -- FORCE RLS is enabled on source tables. A definer owner must bypass it.
    IF f.definer AND NOT EXISTS (
      SELECT 1 FROM pg_roles owner_role
      WHERE owner_role.oid = r.proowner
        AND (owner_role.rolsuper OR owner_role.rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'control0129_0130: definer owner cannot bypass RLS %', f.name;
    END IF;

    IF r.proacl IS NULL OR EXISTS (
      SELECT 1 FROM aclexplode(r.proacl) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'control0129_0130: PUBLIC execute %', f.name;
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'control0129_0130: forbidden effective execute %', f.name;
    END IF;
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE')
       IS DISTINCT FROM (f.name <> 'guard_sale_quote_invoice_uniqueness') THEN
      RAISE EXCEPTION 'control0129_0130: authenticated execute %', f.name;
    END IF;

    IF f.name <> 'guard_sale_quote_invoice_uniqueness' AND NOT EXISTS (
      SELECT 1 FROM aclexplode(r.proacl) a
      WHERE a.grantee = 'authenticated'::regrole
        AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
    ) THEN
      RAISE EXCEPTION 'control0129_0130: missing explicit authenticated grant %', f.name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM aclexplode(r.proacl) a
      WHERE a.grantee IN ('anon'::regrole, 'service_role'::regrole)
         OR (f.name = 'guard_sale_quote_invoice_uniqueness'
             AND a.grantee = 'authenticated'::regrole)
    ) THEN
      RAISE EXCEPTION 'control0129_0130: forbidden explicit ACL %', f.name;
    END IF;
  END LOOP;

  SELECT * INTO t FROM pg_trigger
  WHERE tgrelid = 'public.invoices'::regclass
    AND tgname = 'zzzz_guard_sale_quote_invoice_uniqueness';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'control0129_0130: missing trigger';
  END IF;
  IF t.tgfoid <> 'public.guard_sale_quote_invoice_uniqueness()'::regprocedure
     OR t.tgtype <> 21 OR t.tgenabled <> 'O'
     OR t.tgisinternal OR t.tgnargs <> 0 OR t.tgqual IS NOT NULL
     OR t.tgconstraint <> 0 OR t.tgdeferrable OR t.tginitdeferred
     OR t.tgattr::text <> '' OR octet_length(t.tgargs) <> 0
     OR t.tgoldtable IS NOT NULL OR t.tgnewtable IS NOT NULL THEN
    RAISE EXCEPTION 'control0129_0130: trigger contract';
  END IF;
END
$control$;

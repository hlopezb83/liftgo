-- control0123 receipt: portable, read-only post-condition for migration
-- 0123_quote_charge_legacy_reconciliation (SHA256 8303a6bcbf08...c681).
-- It contains no DDL/DML and never reads the migration ledger, so it is
-- valid in any database where the exact 0123 file has just been applied.
-- Any failure raises and rolls back the whole migration transaction.
DO $control0123$
DECLARE
  r record;
  v_oid oid;
  v_n bigint;
  v_role text;
  v_priv text;
BEGIN
  -- 1. The 18 functions defined by 0123: exact body hash and attributes.
  FOR r IN SELECT * FROM (VALUES
    ('public.guard_quote_charge_legacy_audit()','067dd4481fd2bb8346ca2174a76d349eca52b005c89a19cbac07c442e01837f4',false,'v','plpgsql'),
    ('public.quote_charge_line_hash(jsonb)','d9e4aafa2dd8c58c06a5b961448d619bc23570c3a519e47db02ad7560f206178',false,'i','sql'),
    ('public.quote_charge_invoice_quote_ids(uuid,uuid)','84c51d42e527e34dbb696f6938a38d1e21a8842f6a3af2970cfb888b905223d1',true,'v','sql'),
    ('public.quote_charge_native_line_valid(jsonb,public.invoices)','57b3962a1ce695d998d795bd9997b94f1370767beb1cc7bf69af007e80fa75f7',true,'v','plpgsql'),
    ('public.quote_charge_consumed(uuid,uuid,uuid)','3648b62dcf418cc2f50db44fb1ad4451046a262fe7db57baf326e890cde3864e',true,'v','sql'),
    ('public.quote_charge_legacy_invoice_pending(public.invoices,uuid)','2aceb6daba64c8a736cc65aa0b177e4cd58b8a5fd24bfcbaf3029778a1a4b4f5',true,'v','sql'),
    ('public.quote_charge_invoice_quantity(public.invoices,uuid,uuid)','67d9f0547ec993737207a69e87b096c448ab7853e8fad5903130350b82acde6c',true,'v','sql'),
    ('public.quote_has_legacy_charge_history(uuid,uuid)','587c0c87de3657e4d8095e51f8865878bf44df030dd4279e2f0e7de09695a24c',true,'v','sql'),
    ('public.reconcile_quote_charge_history(uuid,uuid,integer,text,text,uuid,numeric,text,text,uuid)','3aacc1fc9af45ac0433702ad5deed2a59a49456e9b907613fdd69f471601fbc3',true,'v','plpgsql'),
    ('public.reverse_quote_charge_history(uuid,text,text,uuid)','dd4afa745899dad9e91d0facbc3095c96cceaf335c129d9db5361daa16066f26',true,'v','plpgsql'),
    ('public.get_quote_charge_legacy_review(uuid)','f920db19006a10423b56e8b46e76f60ef8e7dc0840cda854da02a72409575111',true,'v','plpgsql'),
    ('public.get_quote_charge_availability(uuid[],uuid)','0460c51526c1b5073b892a5397bd48e296cfa202730e6affa1bd2ff5939a6c8b',true,'v','plpgsql'),
    ('public.guard_reviewed_quote_charge_header()','8dd31d5d9a51e6feb32737240312172c0d8ce76d3a86b3025414665a6d4f2e12',true,'v','plpgsql'),
    ('public.guard_booking_quote_charge_origin()','332e4ec932c5a0fb42c8f17432aa89cd6a172e9cc07fbc4b418e502661450f1b',true,'v','plpgsql'),
    ('public.lock_invoice_quote_charge_link_change()','f2a471c1687308416b08e318f00fb3152b12b1529d39268dcda1eb695ef1bb4e',true,'v','plpgsql'),
    ('public.normalize_quote_charge_identities()','56eb337418c86f1ca7f7aa2dcffaa7dcc79605bddb544cbe6a805a0b642ad2b7',true,'v','plpgsql'),
    ('public.enforce_invoice_quote_charges()','ea8f1710d04e66a58156a96b9190c75012fc7d0df7a08b6f01da753b245ff912',true,'v','plpgsql'),
    ('public.validate_invoice_quote_charge_links()','c73053f69aa7beafab96149424979113288898fbd793b29d3d839845e67ff8f3',true,'v','plpgsql')
  ) AS t(sig, body_sha, definer, volatility, lang) LOOP
    v_oid := to_regprocedure(r.sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'control0123: missing function %', r.sig;
    END IF;
    SELECT count(*) INTO v_n FROM pg_proc p
      WHERE p.oid = v_oid
        AND encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = r.body_sha
        AND p.prosecdef = r.definer
        AND p.provolatile = r.volatility
        AND p.proconfig = ARRAY['search_path=public, pg_temp']
        AND p.prolang = (SELECT l.oid FROM pg_language l WHERE l.lanname = r.lang);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'control0123: definition differs for %', r.sig;
    END IF;
    SELECT count(*) INTO v_n FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname = split_part(split_part(r.sig, '(', 1), '.', 2);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'control0123: expected one overload of %, found %', r.sig, v_n;
    END IF;
  END LOOP;

  -- 2. EXECUTE grants declared by 0123.
  FOR r IN SELECT * FROM (VALUES
    ('public.guard_quote_charge_legacy_audit()', false),
    ('public.quote_charge_line_hash(jsonb)', false),
    ('public.quote_charge_invoice_quote_ids(uuid,uuid)', false),
    ('public.quote_charge_consumed(uuid,uuid,uuid)', false),
    ('public.quote_charge_native_line_valid(jsonb,public.invoices)', false),
    ('public.quote_charge_legacy_invoice_pending(public.invoices,uuid)', false),
    ('public.quote_charge_invoice_quantity(public.invoices,uuid,uuid)', false),
    ('public.quote_has_legacy_charge_history(uuid,uuid)', false),
    ('public.guard_reviewed_quote_charge_header()', false),
    ('public.reconcile_quote_charge_history(uuid,uuid,integer,text,text,uuid,numeric,text,text,uuid)', true),
    ('public.reverse_quote_charge_history(uuid,text,text,uuid)', true),
    ('public.get_quote_charge_legacy_review(uuid)', true)
  ) AS t(sig, authenticated_exec) LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE')
       OR has_function_privilege('service_role', r.sig, 'EXECUTE')
       OR has_function_privilege('authenticated', r.sig, 'EXECUTE') <> r.authenticated_exec THEN
      RAISE EXCEPTION 'control0123: unexpected EXECUTE grant on %', r.sig;
    END IF;
  END LOOP;

  -- 3. Ledger tables: present, RLS on, empty, SELECT-only for authenticated.
  FOR r IN SELECT * FROM (VALUES
    ('public.quote_charge_legacy_reviews'),
    ('public.quote_charge_legacy_reversals')
  ) AS t(tbl) LOOP
    v_oid := to_regclass(r.tbl);
    IF v_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class c WHERE c.oid = v_oid AND c.relkind = 'r' AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'control0123: table missing or RLS disabled: %', r.tbl;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s', v_oid::regclass) INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'control0123: % must be empty, has % rows', r.tbl, v_n;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_role, v_oid, v_priv) <> (v_role = 'authenticated' AND v_priv = 'SELECT') THEN
          RAISE EXCEPTION 'control0123: unexpected % privilege for % on %', v_priv, v_role, r.tbl;
        END IF;
      END LOOP;
      FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_any_column_privilege(v_role, v_oid, v_priv) THEN
          RAISE EXCEPTION 'control0123: unexpected column % privilege for % on %', v_priv, v_role, r.tbl;
        END IF;
      END LOOP;
    END LOOP;
    SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = v_oid;
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'control0123: expected 2 policies on %, found %', r.tbl, v_n;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_oid AND p.polname = 'org_scope_isolation'
        AND NOT p.polpermissive AND p.polcmd = '*'
        AND p.polroles = ARRAY['authenticated'::regrole::oid]
        AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_policy'::regclass AND d.objid = p.oid
            AND d.refclassid = 'pg_proc'::regclass
            AND d.refobjid = 'public.organization_scope_matches(uuid)'::regprocedure
        )
    ) THEN
      RAISE EXCEPTION 'control0123: restrictive org_scope_isolation missing on %', r.tbl;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_oid AND p.polname = replace(r.tbl, 'public.', '') || '_read'
        AND p.polpermissive AND p.polcmd = 'r'
        AND p.polroles = ARRAY['authenticated'::regrole::oid]
        AND p.polwithcheck IS NULL
    ) THEN
      RAISE EXCEPTION 'control0123: read policy missing on %', r.tbl;
    END IF;
  END LOOP;

  -- 4. Triggers: one enabled row trigger per name, exact function, events, columns.
  -- tgtype bits: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16.
  FOR r IN SELECT * FROM (VALUES
    ('public.quote_charge_legacy_reviews', 'trg_organization_write_context', 'public.enforce_organization_write_context()', 23, NULL::text[]),
    ('public.quote_charge_legacy_reversals', 'trg_organization_write_context', 'public.enforce_organization_write_context()', 23, NULL),
    ('public.quote_charge_legacy_reviews', 'quote_charge_legacy_reviews_immutable', 'public.guard_quote_charge_legacy_audit()', 27, NULL),
    ('public.quote_charge_legacy_reversals', 'quote_charge_legacy_reversals_immutable', 'public.guard_quote_charge_legacy_audit()', 27, NULL),
    ('public.quotes', 'zz_guard_reviewed_quote_charge_header', 'public.guard_reviewed_quote_charge_header()', 27, ARRAY['id', 'organization_id', 'customer_id', 'currency']),
    ('public.bookings', 'zzz_guard_booking_quote_charge_origin', 'public.guard_booking_quote_charge_origin()', 27, ARRAY['id', 'organization_id', 'customer_id', 'quote_id']),
    ('public.invoice_bookings', 'zz_lock_invoice_quote_charge_link_change', 'public.lock_invoice_quote_charge_link_change()', 31, NULL)
  ) AS t(tbl, trg, fn, tgtype, cols) LOOP
    SELECT count(*) INTO v_n FROM pg_trigger g
      WHERE g.tgrelid = to_regclass(r.tbl) AND g.tgname = r.trg AND NOT g.tgisinternal
        AND g.tgenabled = 'O' AND g.tgfoid = to_regprocedure(r.fn) AND g.tgtype = r.tgtype
        AND (
          (r.cols IS NULL AND g.tgattr = ''::int2vector)
          OR (r.cols IS NOT NULL AND ARRAY(
            SELECT a.attname::text FROM unnest(g.tgattr::int2[]) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = g.tgrelid AND a.attnum = k.attnum ORDER BY k.ord
          ) = r.cols)
        );
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'control0123: trigger % on % differs', r.trg, r.tbl;
    END IF;
  END LOOP;

  -- 5. Snapshot hash constraint and indexes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.quote_charge_legacy_reviews'::regclass
      AND c.conname = 'quote_charge_review_hash_match' AND c.contype = 'c' AND c.convalidated
  ) OR to_regclass('public.quote_charge_legacy_reviews_scope_idx') IS NULL
    OR to_regclass('public.quote_charge_legacy_reviews_source_idx') IS NULL THEN
    RAISE EXCEPTION 'control0123: hash constraint or ledger indexes missing';
  END IF;

  RAISE NOTICE 'control0123: 18 functions, 12 grants, 2 tables, 7 triggers verified';
END
$control0123$;

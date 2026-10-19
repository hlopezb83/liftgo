-- Target-bound control0108 assertion candidate. Prepared for operator review.
-- Source main: 7d783fd0b4cd316132660ed3e1fcf0f9d65dfcb4.
-- This file contains ONLY assertions, no 0105/0106/0107 SQL, no ledger insertion,
-- no grants/revokes, no schema replacement. The official runner supplies stages.
-- Requires original reviewed stage timestamps/hashes, 109 rows before own record.
-- Exact target security preflight: 2026-10-19T19:58:44.588061+00:00.
DO $control0108$
DECLARE
  v_history text;
  v_oid oid;
  v_proc record;
  v_expected record;
  v_trigger record;
  v_attrs text[];
  v_contract jsonb;
  v_legacy jsonb;
  v_acl jsonb;
  v_new_acl jsonb;
  v_default_acl jsonb;
  v_effective jsonb;
  v_expected_owner text;
  v_previous_id bigint := 107;
  v_stage_id bigint;
  v_security constant jsonb := '{"schemaVersion":1,"scope":"TARGET_OBSERVED_PREFLIGHT_20261019","observedAt":"2026-10-19T19:58:44.588061+00:00","newFunctionOwner":"postgres","functions":[{"signature":"public.claim_payment_rep_stamping(uuid,integer)","owner":"postgres","acl":[{"grantable":false,"grantee":"authenticated","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE"}],"effective":{"anon":false,"authenticated":true,"service_role":true}},{"signature":"public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)","owner":"postgres","acl":[{"grantable":false,"grantee":"authenticated","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE"}],"effective":{"anon":false,"authenticated":true,"service_role":true}},{"signature":"public.e2e_seed_scenario(text)","owner":"postgres","acl":[{"grantable":false,"grantee":"authenticated","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE"}],"effective":{"anon":false,"authenticated":true,"service_role":true}}],"functionDefaultAcls":[{"acl":[{"grantable":false,"grantee":"anon","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"authenticated","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE"}],"owner":"postgres","schema":"public"}],"newFunctionAcls":{"public.guard_booking_cancellation_invoices()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.guard_invoice_booking_cancellation()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.guard_invoice_booking_link_cancellation()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.quote_charge_is_generated_equipment_line(jsonb)":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.quote_charge_invoice_active(public.invoices)":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.normalize_quote_charge_identities()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.quote_has_legacy_charge_history(uuid,uuid)":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.get_quote_charge_availability(uuid[],uuid)":[{"grantable":false,"grantee":"authenticated","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","privilege":"EXECUTE"}],"public.enforce_invoice_quote_charges()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.validate_invoice_quote_charge_links()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.lock_invoice_quote_charge_link_change()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}],"public.guard_booking_quote_charge_origin()":[{"grantable":false,"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE"},{"grantable":false,"grantee":"sandbox_exec_zxefrzfaynnfwazqhwxp","grantor":"postgres","privilege":"EXECUTE"}]}}'::jsonb;
  v_contracts constant jsonb := '[{"signature":"public.claim_payment_rep_stamping(uuid,integer)","return_type":"text","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_payment_id","p_stale_minutes"],"argmodes":null,"allargtypes":null,"nargs":2,"ndefaults":1,"defaults":"5","body_sha256":"b9a45404c415ec0458f38296c5b7b450e22445c073c3f87a61b4bfc5c522887c"},{"signature":"public.guard_booking_cancellation_invoices()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"98028f0c948dffaacd7e1dea9d5d2bb0d249e03265c20a63f3ee168bf6cba311"},{"signature":"public.guard_invoice_booking_cancellation()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"ae3043fca979dad21b50fb1d377374be429464c24e3a851fdbc4128ee9eaa0c1"},{"signature":"public.guard_invoice_booking_link_cancellation()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"7d4015a48c2510721145245e51322e41d1229cafe3e286ac68c49289539486f3"},{"signature":"public.quote_charge_is_generated_equipment_line(jsonb)","return_type":"boolean","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_line"],"argmodes":null,"allargtypes":null,"nargs":1,"ndefaults":0,"defaults":null,"body_sha256":"b80b7b3ec2ad9b50865e28d7bd32aed601e952bd16d8a07246e222981156e1d6"},{"signature":"public.quote_charge_invoice_active(public.invoices)","return_type":"boolean","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_invoice"],"argmodes":null,"allargtypes":null,"nargs":1,"ndefaults":0,"defaults":null,"body_sha256":"89301fd07c50e0519e7b31556ff42e7fb5746e68bb835af9da990bb26c945bdf"},{"signature":"public.normalize_quote_charge_identities()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"61357ccaa56e387771c63c936bd5cb9c776719c395c4602233232719da84405c"},{"signature":"public.quote_has_legacy_charge_history(uuid,uuid)","return_type":"boolean","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_quote_id","p_exclude_invoice_id"],"argmodes":null,"allargtypes":null,"nargs":2,"ndefaults":1,"defaults":"NULL::uuid","body_sha256":"51cc767064edccea1d77b70020f4c265968b5dda9660e55c494072c6127ec0fd"},{"signature":"public.get_quote_charge_availability(uuid[],uuid)","return_type":"jsonb","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_quote_ids","p_exclude_invoice_id"],"argmodes":null,"allargtypes":null,"nargs":2,"ndefaults":1,"defaults":"NULL::uuid","body_sha256":"01b9fdfa62b74bcd3239db07c4388b5570284f6a0415a66f84cc619bc72d25a4"},{"signature":"public.enforce_invoice_quote_charges()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"fbab7ef316d20d377e91765f5a5303b90e2ba5a71eba9fad20c80f16d654779a"},{"signature":"public.validate_invoice_quote_charge_links()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"b065f3bc4da0c8476173ce5e345c94b9aa84c29b214fb6120a8ce3335a3500b6"},{"signature":"public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)","return_type":"record","retset":true,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_booking_ids","p_customer_id","p_customer_name","p_line_items","p_subtotal","p_tax_rate","p_tax_amount","p_total","p_billing_period_start","p_billing_period_end","p_receptor_rfc","p_receptor_razon_social","p_receptor_regimen_fiscal","p_receptor_domicilio_fiscal_cp","p_uso_cfdi","p_moneda","p_tipo_cambio","invoice_id","invoice_number","already_existed"],"argmodes":["i","i","i","i","i","i","i","i","i","i","i","i","i","i","i","i","i","t","t","t"],"allargtypes":["uuid[]","uuid","text","jsonb","numeric","numeric","numeric","numeric","date","date","text","text","text","text","text","text","numeric","uuid","text","boolean"],"nargs":17,"ndefaults":2,"defaults":"''MXN''::text, 1","body_sha256":"068813b479adafcf106e74bba3cb0b2af2e143ed34362b8050c0d0b9997b0b86"},{"signature":"public.lock_invoice_quote_charge_link_change()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"2b4e97fcd6a9102f758eac63d44d0fcbf3d8412f703d1a64682cabcd1412399e"},{"signature":"public.guard_booking_quote_charge_origin()","return_type":"trigger","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":null,"argmodes":null,"allargtypes":null,"nargs":0,"ndefaults":0,"defaults":null,"body_sha256":"b171ece8786e999f1960c4c3b2e616b30c0e3cf1c8e2e525a46242a49f661e69"},{"signature":"public.e2e_seed_scenario(text)","return_type":"jsonb","retset":false,"strict":false,"kind":"f","parallel":"u","leakproof":false,"argnames":["p_scope"],"argmodes":null,"allargtypes":null,"nargs":1,"ndefaults":0,"defaults":null,"body_sha256":"df8360c0e2dcdeedac4ce4c3998d20ce15f03061c1decdb8ca76133b28c1f0f8"}]'::jsonb;
BEGIN
  PERFORM pg_catalog.set_config('search_path','pg_catalog, pg_temp',true);
  -- Exact owner/ACL expectations captured by read-only target preflight.
  -- Preserve observed policy; never grant/revoke or repair it in this control.
  IF v_security->>'scope' IS DISTINCT FROM 'TARGET_OBSERVED_PREFLIGHT_20261019'
     OR coalesce(v_security->>'newFunctionOwner','')=''
     OR jsonb_typeof(v_security->'functions') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_security->'functions') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '0108: falta baseline de seguridad revisado';
  END IF;
  IF (SELECT array_agg(value->>'signature' ORDER BY value->>'signature')
        FROM jsonb_array_elements(v_security->'functions')) IS DISTINCT FROM ARRAY[
      'public.claim_payment_rep_stamping(uuid,integer)',
      'public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)',
      'public.e2e_seed_scenario(text)']::text[]
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_security->'functions') f
       WHERE coalesce(f->>'owner','')=''
          OR jsonb_typeof(f->'acl') IS DISTINCT FROM 'array'
          OR jsonb_typeof(f->'effective') IS DISTINCT FROM 'object'
          OR jsonb_typeof(f->'effective'->'anon') IS DISTINCT FROM 'boolean'
          OR jsonb_typeof(f->'effective'->'authenticated') IS DISTINCT FROM 'boolean'
          OR jsonb_typeof(f->'effective'->'service_role') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION '0108: baseline de seguridad incompleto o duplicado';
  END IF;
  IF current_user IS DISTINCT FROM v_security->>'newFunctionOwner' THEN
    RAISE EXCEPTION '0108: ejecutor diferente del owner revisado';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'owner',pg_get_userbyid(d.defaclrole),
    'schema',CASE WHEN d.defaclnamespace=0 THEN '<global>' ELSE n.nspname END,
    'acl',(SELECT jsonb_agg(jsonb_build_object(
      'grantor',pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
      FROM aclexplode(d.defaclacl) a)) ORDER BY pg_get_userbyid(d.defaclrole),d.defaclnamespace),'[]'::jsonb)
    INTO v_default_acl FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE d.defaclobjtype='f' AND (d.defaclnamespace=0 OR n.nspname='public')
      AND pg_get_userbyid(d.defaclrole)=v_security->>'newFunctionOwner';
  IF v_default_acl IS DISTINCT FROM v_security->'functionDefaultAcls' THEN
    RAISE EXCEPTION '0108: default ACL distinta del preflight';
  END IF;

  -- Aggregate quote checks must see every organization, even with FORCE RLS.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
                 AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '0108: actor sin visibilidad global verificable';
  END IF;
  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION '0108: session_replication_role debe ser origin';
  END IF;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION '0108: falta el ledger de migraciones';
  END IF;

  -- SHA256 nativo: fallar si el entorno no ofrece esta comprobación.
  IF to_regprocedure('pg_catalog.sha256(bytea)') IS NULL THEN
    RAISE EXCEPTION '0108: SHA256 nativo no disponible';
  END IF;

  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 109 THEN
    RAISE EXCEPTION '0108: se requieren 109 filas antes de registrar el control';
  END IF;

  IF EXISTS (SELECT id FROM drizzle.__drizzle_migrations GROUP BY id HAVING count(*)<>1)
     OR EXISTS (SELECT created_at FROM drizzle.__drizzle_migrations GROUP BY created_at HAVING count(*)<>1)
     OR EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
                WHERE id IS NULL OR created_at IS NULL OR hash IS NULL) THEN
    RAISE EXCEPTION '0108: identidad duplicada o nula en el ledger';
  END IF;

  IF (SELECT count(*) FROM drizzle.__drizzle_migrations
      WHERE id <= 107) <> 106 THEN
    RAISE EXCEPTION '0108: cambió el tamaño del historial aceptado';
  END IF;

  SELECT encode(pg_catalog.sha256(convert_to(
    string_agg(id::text || ':' || created_at::text || ':' || hash,
               E'\n' ORDER BY id), 'UTF8')), 'hex')
    INTO v_history
    FROM drizzle.__drizzle_migrations
    WHERE id <= 107;

  IF v_history IS DISTINCT FROM
     '9b7baf5f1bf7d180c4b5cec686152b36600fb62a2a58d5fa2a3fe2bd9ecaa125' THEN
    RAISE EXCEPTION '0108: el historial previo difiere del aceptado';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      (1792391158311::bigint,
       '90eb081d9547456abef06f8ca74d46130367f437f472dc35836e43af9df8f663'),
      (1792392861354::bigint,
       'b364165b0d27f207b7a2b99ecfe1fa00ceab70ba4277ff1b3d155a3fd4d0d2a1'),
      (1792392861355::bigint,
       'b6ba356d8138421d8d6236a1be40ad0a4881c5c1403d90435fa3ba98eb862de1')
    ) AS e(stamp, checksum) ORDER BY stamp
  LOOP
    IF (SELECT count(*) FROM drizzle.__drizzle_migrations
        WHERE created_at = v_expected.stamp) <> 1
       OR (SELECT count(*) FROM drizzle.__drizzle_migrations
           WHERE hash = v_expected.checksum) <> 1
       OR (SELECT count(*) FROM drizzle.__drizzle_migrations
           WHERE id > 107 AND created_at = v_expected.stamp
             AND hash = v_expected.checksum) <> 1 THEN
      RAISE EXCEPTION '0108: migración ausente, duplicada o diferente: %',
        v_expected.stamp;
    END IF;
    SELECT id INTO STRICT v_stage_id FROM drizzle.__drizzle_migrations
      WHERE created_at=v_expected.stamp AND hash=v_expected.checksum;
    IF v_stage_id <= v_previous_id THEN
      RAISE EXCEPTION '0108: orden incorrecto; se requiere 0105 antes de 0106 antes de 0107';
    END IF;
    v_previous_id := v_stage_id;
  END LOOP;

  -- Cuerpo exacto, firma, propietario, lenguaje, modo y search_path.
  -- Los hashes se calcularon sobre el contenido entre delimitadores SQL,
  -- incluidos sus saltos de línea; se comparan con pg_proc.prosrc.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.claim_payment_rep_stamping(uuid,integer)',
       'b9a45404c415ec0458f38296c5b7b450e22445c073c3f87a61b4bfc5c522887c',
       'plpgsql', 'v', true, 'search_path=public'),
      ('public.guard_booking_cancellation_invoices()',
       '98028f0c948dffaacd7e1dea9d5d2bb0d249e03265c20a63f3ee168bf6cba311',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.guard_invoice_booking_cancellation()',
       'ae3043fca979dad21b50fb1d377374be429464c24e3a851fdbc4128ee9eaa0c1',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.guard_invoice_booking_link_cancellation()',
       '7d4015a48c2510721145245e51322e41d1229cafe3e286ac68c49289539486f3',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.quote_charge_is_generated_equipment_line(jsonb)',
       'b80b7b3ec2ad9b50865e28d7bd32aed601e952bd16d8a07246e222981156e1d6',
       'sql', 'i', false, 'search_path=public, pg_temp'),
      ('public.quote_charge_invoice_active(public.invoices)',
       '89301fd07c50e0519e7b31556ff42e7fb5746e68bb835af9da990bb26c945bdf',
       'sql', 'i', false, 'search_path=public, pg_temp'),
      ('public.normalize_quote_charge_identities()',
       '61357ccaa56e387771c63c936bd5cb9c776719c395c4602233232719da84405c',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.quote_has_legacy_charge_history(uuid,uuid)',
       '51cc767064edccea1d77b70020f4c265968b5dda9660e55c494072c6127ec0fd',
       'sql', 'v', true, 'search_path=public, pg_temp'),
      ('public.get_quote_charge_availability(uuid[],uuid)',
       '01b9fdfa62b74bcd3239db07c4388b5570284f6a0415a66f84cc619bc72d25a4',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.enforce_invoice_quote_charges()',
       'fbab7ef316d20d377e91765f5a5303b90e2ba5a71eba9fad20c80f16d654779a',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.validate_invoice_quote_charge_links()',
       'b065f3bc4da0c8476173ce5e345c94b9aa84c29b214fb6120a8ce3335a3500b6',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)',
       '068813b479adafcf106e74bba3cb0b2af2e143ed34362b8050c0d0b9997b0b86',
       'plpgsql', 'v', true, 'search_path=public'),
      ('public.lock_invoice_quote_charge_link_change()',
       '2b4e97fcd6a9102f758eac63d44d0fcbf3d8412f703d1a64682cabcd1412399e',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.guard_booking_quote_charge_origin()',
       'b171ece8786e999f1960c4c3b2e616b30c0e3cf1c8e2e525a46242a49f661e69',
       'plpgsql', 'v', true, 'search_path=public, pg_temp'),
      ('public.e2e_seed_scenario(text)',
       'df8360c0e2dcdeedac4ce4c3998d20ce15f03061c1decdb8ca76133b28c1f0f8',
       'plpgsql', 'v', true, 'search_path=public')
    ) AS e(signature, checksum, language_name, volatility, definer, path_setting)
  LOOP
    v_oid := to_regprocedure(v_expected.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '0108: falta función %', v_expected.signature;
    END IF;
    SELECT p.*, l.lanname, pg_get_userbyid(p.proowner) AS owner_name
      INTO STRICT v_proc FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_oid;
    SELECT value INTO STRICT v_contract FROM jsonb_array_elements(v_contracts)
      WHERE value->>'signature'=v_expected.signature;
    v_legacy := NULL;
    IF v_expected.signature IN (
      'public.claim_payment_rep_stamping(uuid,integer)',
      'public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)',
      'public.e2e_seed_scenario(text)') THEN
      SELECT value INTO STRICT v_legacy FROM jsonb_array_elements(v_security->'functions')
        WHERE value->>'signature'=v_expected.signature;
    END IF;
    v_expected_owner := coalesce(v_legacy->>'owner',v_security->>'newFunctionOwner');
    IF encode(pg_catalog.sha256(convert_to(v_proc.prosrc,'UTF8')),'hex')
         IS DISTINCT FROM v_expected.checksum
       OR v_proc.lanname IS DISTINCT FROM v_expected.language_name
       OR v_proc.provolatile::text IS DISTINCT FROM v_expected.volatility
       OR v_proc.prosecdef IS DISTINCT FROM v_expected.definer
       OR v_proc.owner_name IS DISTINCT FROM v_expected_owner
       OR v_proc.proconfig IS DISTINCT FROM ARRAY[v_expected.path_setting]::text[] THEN
      RAISE EXCEPTION '0108: definición o seguridad distinta: %', v_expected.signature;
    END IF;

    -- Return values, STRICT, OUT/TABLE names and modes, defaults and function kind
    -- are callable API/security contracts that a prosrc checksum does not cover.
    IF v_proc.prorettype IS DISTINCT FROM to_regtype(v_contract->>'return_type')::oid
       OR v_proc.proretset IS DISTINCT FROM (v_contract->>'retset')::boolean
       OR v_proc.proisstrict IS DISTINCT FROM (v_contract->>'strict')::boolean
       OR v_proc.prokind::text IS DISTINCT FROM v_contract->>'kind'
       OR v_proc.proparallel::text IS DISTINCT FROM v_contract->>'parallel'
       OR v_proc.proleakproof IS DISTINCT FROM (v_contract->>'leakproof')::boolean
       OR v_proc.pronargs IS DISTINCT FROM (v_contract->>'nargs')::integer
       OR v_proc.pronargdefaults IS DISTINCT FROM (v_contract->>'ndefaults')::integer
       OR coalesce(to_jsonb(v_proc.proargnames),'null'::jsonb) IS DISTINCT FROM v_contract->'argnames'
       OR coalesce(to_jsonb(v_proc.proargmodes),'null'::jsonb) IS DISTINCT FROM v_contract->'argmodes'
       OR v_proc.proallargtypes IS DISTINCT FROM
          (SELECT array_agg(to_regtype(value)::oid ORDER BY ord)
             FROM jsonb_array_elements_text(nullif(v_contract->'allargtypes','null'::jsonb)) WITH ORDINALITY a(value,ord))
       OR pg_get_expr(v_proc.proargdefaults,0) IS DISTINCT FROM v_contract->>'defaults' THEN
      RAISE EXCEPTION '0108: contrato de argumentos o retorno distinto: %',v_expected.signature;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
          'grantor',pg_get_userbyid(a.grantor),
          'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          'privilege',a.privilege_type,'grantable',a.is_grantable)
          ORDER BY pg_get_userbyid(a.grantor),
                   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
                   a.privilege_type,a.is_grantable),'[]'::jsonb)
      INTO v_acl FROM aclexplode(coalesce(v_proc.proacl,acldefault('f',v_proc.proowner))) a;
    IF v_legacy IS NOT NULL THEN
      v_effective := jsonb_build_object(
        'anon',has_function_privilege('anon',v_oid,'EXECUTE'),
        'authenticated',has_function_privilege('authenticated',v_oid,'EXECUTE'),
        'service_role',has_function_privilege('service_role',v_oid,'EXECUTE'));
      IF v_acl IS DISTINCT FROM v_legacy->'acl'
         OR v_effective IS DISTINCT FROM v_legacy->'effective' THEN
        RAISE EXCEPTION '0108: ACL heredada distinta del baseline: %',v_expected.signature;
      END IF;
    ELSE
      -- Exact post-migration ACL derived from observed default privileges and
      -- the unchanged source REVOKE/GRANT statements, including platform role.
      v_new_acl := v_security->'newFunctionAcls'->v_expected.signature;
      IF jsonb_typeof(v_new_acl) IS DISTINCT FROM 'array'
         OR v_acl IS DISTINCT FROM v_new_acl THEN
        RAISE EXCEPTION '0108: ACL nueva no revisada: %',v_expected.signature;
      END IF;
    END IF;

    -- Estas funciones se revocan expresamente a los cuatro destinatarios.
    IF v_expected.signature NOT IN (
      'public.claim_payment_rep_stamping(uuid,integer)',
      'public.get_quote_charge_availability(uuid[],uuid)',
      'public.create_recurring_invoice(uuid[],uuid,text,jsonb,numeric,numeric,numeric,numeric,date,date,text,text,text,text,text,text,numeric)',
      'public.e2e_seed_scenario(text)'
    ) AND (
      EXISTS (SELECT 1 FROM aclexplode(coalesce(v_proc.proacl,
                    acldefault('f',v_proc.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
      OR has_function_privilege('anon',v_oid,'EXECUTE')
      OR has_function_privilege('authenticated',v_oid,'EXECUTE')
      OR has_function_privilege('service_role',v_oid,'EXECUTE')
    ) THEN
      RAISE EXCEPTION '0108: función privada accesible: %', v_expected.signature;
    END IF;
  END LOOP;

  v_oid := to_regprocedure('public.get_quote_charge_availability(uuid[],uuid)');
  IF has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p,
                LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                WHERE p.oid=v_oid AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION '0108: permisos incorrectos en disponibilidad de cargos';
  END IF;

  -- tgtype verifica momento, eventos y ejecución por fila.
  -- tgattr verifica las columnas UPDATE OF, no sólo el nombre.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.bookings','zz_guard_booking_cancellation_invoices',
       'public.guard_booking_cancellation_invoices()',19,false,false,ARRAY['status']::text[]),
      ('public.invoices','zz_guard_invoice_booking_cancellation',
       'public.guard_invoice_booking_cancellation()',23,false,false,
       ARRAY['booking_id','cancellation_status','cfdi_status','status']::text[]),
      ('public.invoice_bookings','zz_guard_invoice_booking_link_cancellation',
       'public.guard_invoice_booking_link_cancellation()',23,false,false,
       ARRAY['booking_id','invoice_id']::text[]),
      ('public.quotes','zz_normalize_quote_charge_identities',
       'public.normalize_quote_charge_identities()',23,false,false,ARRAY['line_items']::text[]),
      ('public.invoices','zzz_enforce_invoice_quote_charges',
       'public.enforce_invoice_quote_charges()',31,false,false,ARRAY[]::text[]),
      ('public.invoices','invoice_quote_charge_links',
       'public.validate_invoice_quote_charge_links()',21,true,true,ARRAY[]::text[]),
      ('public.invoice_bookings','invoice_booking_quote_charge_links',
       'public.validate_invoice_quote_charge_links()',29,true,true,ARRAY[]::text[]),
      ('public.invoice_bookings','zz_lock_invoice_quote_charge_link_change',
       'public.lock_invoice_quote_charge_link_change()',27,false,false,ARRAY[]::text[]),
      ('public.bookings','zzz_guard_booking_quote_charge_origin',
       'public.guard_booking_quote_charge_origin()',19,false,false,ARRAY['quote_id']::text[])
    ) AS e(relation_name, trigger_name, signature, event_bits,
           deferred_capable, initially_deferred, column_names)
  LOOP
    SELECT t.* INTO v_trigger FROM pg_trigger t
      WHERE t.tgrelid=to_regclass(v_expected.relation_name)
        AND t.tgname=v_expected.trigger_name AND NOT t.tgisinternal;
    IF NOT FOUND THEN
      RAISE EXCEPTION '0108: falta trigger %', v_expected.trigger_name;
    END IF;
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname::text),ARRAY[]::text[])
      INTO v_attrs FROM unnest(v_trigger.tgattr::smallint[]) n(attnum)
      JOIN pg_attribute a ON a.attrelid=v_trigger.tgrelid AND a.attnum=n.attnum;
    IF v_trigger.tgfoid IS DISTINCT FROM to_regprocedure(v_expected.signature)::oid
       OR v_trigger.tgtype::integer IS DISTINCT FROM v_expected.event_bits
       OR v_trigger.tgenabled IS DISTINCT FROM 'O'::"char"
       OR v_trigger.tgdeferrable IS DISTINCT FROM v_expected.deferred_capable
       OR v_trigger.tginitdeferred IS DISTINCT FROM v_expected.initially_deferred
       OR v_attrs IS DISTINCT FROM v_expected.column_names
       OR v_trigger.tgqual IS NOT NULL
       OR v_trigger.tgnargs <> 0
       OR (v_trigger.tgconstraint <> 0) IS DISTINCT FROM v_expected.deferred_capable THEN
      RAISE EXCEPTION '0108: configuración distinta del trigger %', v_expected.trigger_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.invoices'::regclass
      AND a.attname='quote_charge_tracking_version' AND NOT a.attisdropped
      AND a.atttypid='smallint'::regtype AND NOT a.attnotnull
      AND a.attgenerated='' AND a.attidentity=''
      AND pg_get_expr(d.adbin,d.adrelid) IN ('1','1::smallint','(1)::smallint')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.invoices'::regclass
      AND a.attname='quote_charge_ever_issued' AND NOT a.attisdropped
      AND a.atttypid='boolean'::regtype AND a.attnotnull
      AND a.attgenerated='' AND a.attidentity=''
      AND pg_get_expr(d.adbin,d.adrelid)='false'
  ) THEN
    RAISE EXCEPTION '0108: faltan columnas o difieren sus tipos/defaults/nulabilidad';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.invoices'::regclass
      AND c.conname='invoice_quote_charge_tracking_version'
      AND c.contype='c' AND c.convalidated AND NOT c.connoinherit
      AND regexp_replace(pg_get_constraintdef(c.oid), '[[:space:]()]', '', 'g')
          = 'CHECKquote_charge_tracking_versionISNULLORquote_charge_tracking_version=1'
  ) THEN
    RAISE EXCEPTION '0108: falta o difiere el CHECK de versión de trazabilidad';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_am am ON am.oid=idx.relam
    JOIN pg_opclass op ON op.oid=i.indclass[0]
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indexrelid=to_regclass('public.invoices_quote_charge_origins_idx')
      AND i.indrelid='public.invoices'::regclass
      AND i.indisvalid AND i.indisready AND NOT i.indisunique
      AND i.indnatts=1 AND i.indnkeyatts=1
      AND i.indexprs IS NULL AND i.indpred IS NULL
      AND am.amname='gin' AND op.opcname='jsonb_path_ops'
      AND op.opcnamespace='pg_catalog'::regnamespace
      AND a.attname='line_items'
  ) THEN
    RAISE EXCEPTION '0108: falta o difiere el índice de origen de cargos';
  END IF;

  -- Comprobación agregada de la inicialización real de cotizaciones.
  -- No atribuye orígenes a facturas históricas ni las modifica.
  IF EXISTS (SELECT 1 FROM public.quotes q
             WHERE jsonb_typeof(q.line_items) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION '0108: cotizaciones con partidas no inicializables';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotes q,
      LATERAL jsonb_array_elements(q.line_items) l
    WHERE jsonb_typeof(l) IS DISTINCT FROM 'object'
       OR coalesce(l->>'quote_line_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR coalesce(l->>'line_kind','')=''
  ) THEN
    RAISE EXCEPTION '0108: faltan identidades o tipos de partidas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotes q,
      LATERAL jsonb_array_elements(q.line_items) l
    GROUP BY q.id, lower(l->>'quote_line_id') HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION '0108: identidades de partidas duplicadas';
  END IF;

  -- Match the source normalizer's postconditions without inventing invoice origins.
  -- The preceding syntax check makes the UUID cast safe.
  IF EXISTS (SELECT 1 FROM public.quotes q,
      LATERAL jsonb_array_elements(q.line_items) l
      WHERE l->>'quote_line_id' IS DISTINCT FROM (l->>'quote_line_id')::uuid::text
         OR (l->>'line_kind'='charge'
             AND l->>'description' IN ('Servicio de Logística','Seguro')
             AND coalesce(l->>'charge_kind','')='')) THEN
    RAISE EXCEPTION '0108: normalización de partidas incompleta';
  END IF;

  RAISE NOTICE '0108: historial y 0105–0107 comprobados; 109 filas antes del registro';
END
$control0108$;

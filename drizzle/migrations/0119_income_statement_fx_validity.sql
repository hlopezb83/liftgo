-- H03: use the existing canonical missing-FX rule in totals, details and warnings.
-- Forward-only function-body change. No data, signature, ACL, role or policy changes.
DO $migration$
DECLARE
  v_signature text;
  v_def text;
  v_old text;
  v_new text;
  v_expected integer;
  v_hash text;
  v_alias text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure AND NOT prosecdef)
    IS DISTINCT FROM '8eaea67eae90162980674c73bf29f5b8' THEN
    RAISE EXCEPTION 'ER0119: unexpected canonical source; review before applying';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)'::regprocedure AND NOT prosecdef)
    IS DISTINCT FROM '4886d5765d6352d6f6a08689376abc12' THEN
    RAISE EXCEPTION 'ER0119: unexpected document source; review before applying';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_income_statement(date,date,text)',
    'public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)'
  ] LOOP
    v_def := pg_get_functiondef(v_signature::regprocedure);
    v_old := $old$(COALESCE(i.moneda, 'MXN') = 'MXN' OR COALESCE(NULLIF(i.tipo_cambio, 0), 0) > 0)$old$;
    v_new := $new$NOT (public.fx_is_missing(i.moneda, i.tipo_cambio) OR (upper(COALESCE(i.moneda, 'MXN')) <> 'MXN' AND i.tipo_cambio::text IN ('NaN', 'Infinity', '-Infinity')))$new$;
    v_expected := CASE WHEN v_signature = 'public.get_income_statement(date,date,text)' THEN 2 ELSE 1 END;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> v_expected THEN
      RAISE EXCEPTION 'ER0119: inclusion anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old$(COALESCE(pi.moneda, 'MXN') = 'MXN' OR COALESCE(NULLIF(pi.tipo_cambio, 0), 0) > 0)$old$;
    v_new := $new$NOT (public.fx_is_missing(pi.moneda, pi.tipo_cambio) OR (upper(COALESCE(pi.moneda, 'MXN')) <> 'MXN' AND pi.tipo_cambio::text IN ('NaN', 'Infinity', '-Infinity')))$new$;
    v_expected := 1;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> v_expected THEN
      RAISE EXCEPTION 'ER0119: inclusion anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old$(COALESCE(sb.currency, 'MXN') = 'MXN' OR COALESCE(NULLIF(sb.exchange_rate, 0), 0) > 0)$old$;
    v_new := $new$NOT (public.fx_is_missing(sb.currency, sb.exchange_rate) OR (upper(COALESCE(sb.currency, 'MXN')) <> 'MXN' AND sb.exchange_rate::text IN ('NaN', 'Infinity', '-Infinity')))$new$;
    v_expected := 1;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> v_expected THEN
      RAISE EXCEPTION 'ER0119: inclusion anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old$COALESCE(NULLIF(i.tipo_cambio, 0), 1)$old$;
    v_new := $new$(CASE WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN 1 ELSE i.tipo_cambio END)$new$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 2 THEN
      RAISE EXCEPTION 'ER0119: currency multiplier anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old$COALESCE(NULLIF(pi.tipo_cambio, 0), 1)$old$;
    v_new := $new$(CASE WHEN upper(COALESCE(pi.moneda, 'MXN')) = 'MXN' THEN 1 ELSE pi.tipo_cambio END)$new$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 2 THEN
      RAISE EXCEPTION 'ER0119: currency multiplier anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old$COALESCE(NULLIF(sb.exchange_rate, 0), 1)$old$;
    v_new := $new$(CASE WHEN upper(COALESCE(sb.currency, 'MXN')) = 'MXN' THEN 1 ELSE sb.exchange_rate END)$new$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 3 THEN
      RAISE EXCEPTION 'ER0119: currency multiplier anchor missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    -- Numeric admits NaN and infinities. Sanitize only payment rates, retaining
    -- fx_convert_amount's same-currency rule and its MXN rate-independent path.
    FOREACH v_alias IN ARRAY ARRAY['pay', 'p2', 'cp'] LOOP
      v_old := format('NULLIF(%s.exchange_rate, 0)', v_alias);
      v_new := format('(CASE WHEN %s.exchange_rate::text IN (''NaN'', ''Infinity'', ''-Infinity'') THEN NULL ELSE NULLIF(%s.exchange_rate, 0) END)', v_alias, v_alias);
      v_expected := CASE v_alias WHEN 'pay' THEN CASE WHEN v_signature = 'public.get_income_statement(date,date,text)' THEN 3 ELSE 2 END ELSE 1 END;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> v_expected THEN
        RAISE EXCEPTION 'ER0119: payment rate anchor missing or ambiguous in % for %', v_signature, v_alias;
      END IF;
      v_def := replace(v_def, v_old, v_new);
    END LOOP;
    IF v_signature = 'public.get_income_statement(date,date,text)' THEN
      v_old := $old$COALESCE(i.moneda, 'MXN') <> 'MXN'
         AND COALESCE(NULLIF(i.tipo_cambio, 0), 0) = 0$old$;
      v_new := $new$(public.fx_is_missing(i.moneda, i.tipo_cambio) OR (upper(COALESCE(i.moneda, 'MXN')) <> 'MXN' AND i.tipo_cambio::text IN ('NaN', 'Infinity', '-Infinity')))$new$;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0119: warning anchor missing or ambiguous';
      END IF;
      v_def := replace(v_def, v_old, v_new);
      v_old := $old$COALESCE(sb.currency, 'MXN') <> 'MXN'
         AND COALESCE(NULLIF(sb.exchange_rate, 0), 0) = 0$old$;
      v_new := $new$(public.fx_is_missing(sb.currency, sb.exchange_rate) OR (upper(COALESCE(sb.currency, 'MXN')) <> 'MXN' AND sb.exchange_rate::text IN ('NaN', 'Infinity', '-Infinity')))$new$;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0119: warning anchor missing or ambiguous';
      END IF;
      v_def := replace(v_def, v_old, v_new);
      v_old := $old$AND i.issued_at BETWEEN p_start_date AND p_end_date
    ),
    'payments'$old$;
      v_new := $new$AND (i.issued_at BETWEEN p_start_date AND p_end_date
           OR (p_basis = 'cash' AND EXISTS (SELECT 1 FROM public.payments px
             WHERE px.invoice_id = i.id AND px.payment_date BETWEEN p_start_date AND p_end_date))
           OR EXISTS (SELECT 1 FROM public.credit_notes cx WHERE cx.invoice_id = i.id
             AND cx.status NOT IN ('draft','cancelled') AND cx.cfdi_status = 'stamped'
             AND cx.cancellation_status IS DISTINCT FROM 'accepted'
             AND cx.issued_at BETWEEN p_start_date AND p_end_date))
    ),
    'payments'$new$;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0119: warning-period anchor missing or ambiguous';
      END IF;
      v_def := replace(v_def, v_old, v_new);
      v_old := $old$AND sb.issue_date BETWEEN p_start_date AND p_end_date
    )
  ) INTO v_fx_missing;$old$;
      v_new := $new$AND (sb.issue_date BETWEEN p_start_date AND p_end_date
           OR (p_basis = 'cash' AND EXISTS (SELECT 1 FROM public.supplier_payments spx
             WHERE spx.bill_id = sb.id AND spx.payment_date BETWEEN p_start_date AND p_end_date))
           OR (p_basis = 'accrual' AND sb.coverage_start <= p_end_date AND sb.coverage_end >= p_start_date))
    )
  ) INTO v_fx_missing;$new$;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0119: warning-period anchor missing or ambiguous';
      END IF;
      v_def := replace(v_def, v_old, v_new);
    ELSE
      SELECT md5(prosrc) INTO STRICT v_hash FROM pg_proc
        WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure AND NOT prosecdef;
      v_old := '8eaea67eae90162980674c73bf29f5b8';
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0119: document fingerprint prerequisite missing';
      END IF;
      v_def := replace(v_def, v_old, v_hash);
    END IF;
    EXECUTE v_def;
  END LOOP;
END;
$migration$;

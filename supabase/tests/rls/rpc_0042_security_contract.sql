-- Multiempresa · paso 5: contrato de catálogo de las doce RPC SECURITY DEFINER
-- de folios de nota de crédito, banca, mantenimiento, inspecciones, intentos de
-- pago, prospectos, roles y secretos de facturación (migración Drizzle 0042).
--
-- Comprueba, sin escribir datos:
--   1) Las doce firmas exactas existen y siguen SECURITY DEFINER.
--   2) search_path fijo y seguro ('public').
--   3) Cada una contiene current_internal_organization_id + is_internal_member
--      y acota filas por organization_id.
--   4) anon y PUBLIC sin EXECUTE; authenticated con EXECUTE.
BEGIN;

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_cfg text[];
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.assign_stamped_credit_note_number(uuid, text)',
    'public.begin_bank_statement_upload(uuid, uuid, text, date, date, integer)',
    'public.stage_bank_statement_chunk(uuid, integer, jsonb)',
    'public.finalize_bank_statement_upload(uuid)',
    'public.match_bank_statement_lines(uuid)',
    'public.claim_maintenance_policy_month(uuid, text)',
    'public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz)',
    'public.correct_return_inspection(uuid, text, text, text, numeric, numeric, text)',
    'public.reject_payment_intent(uuid, text)',
    'public.reorder_prospect_stage(uuid, text, integer)',
    'public.update_user_role_safe(uuid, app_role)',
    'public.upsert_billing_secret(uuid, text, text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'RPC 0042: falta la función %', v_sig;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      v_fallas := array_append(v_fallas, v_sig || ': debe seguir SECURITY DEFINER');
      CONTINUE;
    END IF;

    SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
    IF v_cfg IS NULL OR NOT ('search_path=public' = ANY(v_cfg)) THEN
      v_fallas := array_append(v_fallas, v_sig || ': search_path no es public fijo');
    END IF;

    v_def := pg_get_functiondef(v_oid);

    IF v_def !~ 'current_internal_organization_id' THEN
      v_fallas := array_append(v_fallas, v_sig || ': sin guarda de organización');
    END IF;
    IF v_def !~ 'is_internal_member' THEN
      v_fallas := array_append(v_fallas, v_sig || ': no exige membresía interna');
    END IF;
    IF v_def !~ 'organization_id' THEN
      v_fallas := array_append(v_fallas, v_sig || ': no acota las filas por organización');
    END IF;

    IF has_function_privilege('public', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, v_sig || ': PUBLIC conserva EXECUTE');
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, v_sig || ': anon conserva EXECUTE');
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_fallas := array_append(v_fallas, v_sig || ': authenticated perdió EXECUTE');
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) > 0 THEN
    RAISE EXCEPTION 'CONTRATO RPC 0042 incumplido: %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: contrato de las 12 RPC del lote 0042';
END $$;

ROLLBACK;

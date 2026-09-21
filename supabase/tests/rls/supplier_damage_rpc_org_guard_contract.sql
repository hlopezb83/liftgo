-- Multiempresa · paso 4 lote B: contrato de catálogo de las RPC SECURITY
-- DEFINER de cuentas por pagar, daños, bitácora y sincronizaciones masivas
-- (migración Drizzle 0041).
--
-- Comprueba, sin escribir datos:
--   1) Las diecisiete firmas siguen SECURITY DEFINER.
--   2) Cada una contiene guarda organizacional explícita
--      (current_internal_organization_id + is_internal_member + organization_id).
--   3) Ninguna es alcanzable por PUBLIC ni por anon; authenticated y
--      service_role conservan EXECUTE.
--   4) revert_audit_log añade predicado organizacional al SQL dinámico.
BEGIN;

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.approve_supplier_bill(uuid, text)',
    'public.reject_supplier_bill(uuid, text)',
    'public.request_bill_reapproval(uuid, text)',
    'public.register_supplier_payment(uuid, numeric, date, text, text, text, text, text)',
    'public.register_supplier_payment(uuid, numeric, date, text, text, text, text, text, uuid)',
    'public.mark_supplier_rep_rejected(uuid, text)',
    'public.reset_supplier_rep_pending(uuid)',
    'public.create_supplier_payment_batch(uuid[], date, text, text)',
    'public.create_supplier_payment_batch(jsonb, text)',
    'public.release_stale_payment_locks(integer)',
    'public.soft_delete_damage_record(uuid)',
    'public.restore_damage_record(uuid)',
    'public.start_repair_work_order(uuid, text, text, numeric)',
    'public.revert_audit_log(uuid)',
    'public.sync_forklift_rental_status()',
    'public.sync_invoice_status(uuid)',
    'public.create_recurring_invoice(uuid[], uuid, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, text, text, text, text, text, numeric)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'RPC 0041: falta la función %', v_sig;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      v_fallas := v_fallas || (v_sig || ': debe seguir SECURITY DEFINER');
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);

    IF v_def !~ 'current_internal_organization_id' THEN
      v_fallas := v_fallas || (v_sig || ': sin guarda de organización');
    END IF;

    IF v_def !~ 'is_internal_member' THEN
      v_fallas := v_fallas || (v_sig || ': no exige membresía interna');
    END IF;

    IF v_def !~ 'organization_id' THEN
      v_fallas := v_fallas || (v_sig || ': no acota las filas por organización');
    END IF;

    -- ACL
    IF has_function_privilege('public', v_oid, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ': PUBLIC conserva EXECUTE');
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ': anon conserva EXECUTE');
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ': authenticated perdió EXECUTE');
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ': service_role perdió EXECUTE');
    END IF;
  END LOOP;

  -- El SQL dinámico de revert_audit_log debe llevar predicado organizacional.
  IF pg_get_functiondef('public.revert_audit_log(uuid)'::regprocedure) !~ 'v_org_pred' THEN
    v_fallas := v_fallas ||
      'public.revert_audit_log(uuid): el SQL dinámico no incluye predicado organizacional';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0041: contrato incumplido:\n%', array_to_string(v_fallas, E'\n');
  END IF;

  RAISE NOTICE 'OK: las 17 RPC del lote B son DEFINER con guarda organizacional y ACL cerrada';
END;
$$;

ROLLBACK;

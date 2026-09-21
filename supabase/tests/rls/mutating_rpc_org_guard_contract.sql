-- Multiempresa · paso 4 lote A: contrato de catálogo de las RPC SECURITY
-- DEFINER que mutan datos por UUID (migración Drizzle 0040).
--
-- Comprueba, sin escribir datos:
--   1) Las catorce funciones siguen SECURITY DEFINER.
--   2) Cada una contiene guarda organizacional explícita
--      (current_internal_organization_id + is_internal_member).
--   3) Ninguna es alcanzable por PUBLIC ni por anon; authenticated y
--      service_role conservan EXECUTE.
BEGIN;

DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_def text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.approve_payment_intent(uuid, text, text)',
    'public.assign_stamped_invoice_number(uuid, text, text)',
    'public.cancel_supplier_payment_batch(uuid)',
    'public.change_feedback_status(uuid, text, text)',
    'public.change_forklift_status(uuid, text, text)',
    'public.claim_payment_rep_stamping(uuid, integer)',
    'public.delete_forklift(uuid)',
    'public.reopen_work_order(uuid, text)',
    'public.restore_customer(uuid)',
    'public.restore_forklift(uuid)',
    'public.restore_maintenance_log(uuid)',
    'public.restore_supplier(uuid)',
    'public.soft_delete_maintenance_log(uuid)',
    'public.soft_delete_supplier(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'RPC 0040: falta la función %', v_sig;
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
      v_fallas := v_fallas || (v_sig || ': no acota la fila objetivo por organización');
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

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC 0040: contrato incumplido:\n%', array_to_string(v_fallas, E'\n');
  END IF;

  RAISE NOTICE 'OK: las 14 RPC mutantes son DEFINER con guarda organizacional y ACL cerrada';
END;
$$;

ROLLBACK;

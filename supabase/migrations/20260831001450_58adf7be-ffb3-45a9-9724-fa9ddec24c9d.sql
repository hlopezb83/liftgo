-- A3-01 / A3-05a
DO $mig$
DECLARE d text; o text;
BEGIN
  -- A3-01: excepcion controlada al bloqueo de cliente en cotizacion aceptada
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='lock_accepted_quote_amounts';
  o := d;
  d := replace(d,
    E'BEGIN\n  IF OLD.status IN (''accepted'',''converted'') AND (',
    E'BEGIN\n  IF current_setting(''app.quote_reassign_customer'', true) = ''on''\n     AND OLD.status = ''accepted''\n     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal\n     AND NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount\n     AND NEW.tax_rate IS NOT DISTINCT FROM OLD.tax_rate\n     AND NEW.total IS NOT DISTINCT FROM OLD.total\n     AND NEW.line_items IS NOT DISTINCT FROM OLD.line_items\n     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date\n     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date\n     AND NEW.forklift_id IS NOT DISTINCT FROM OLD.forklift_id\n     AND NEW.quote_type IS NOT DISTINCT FROM OLD.quote_type\n     AND NEW.rental_meta IS NOT DISTINCT FROM OLD.rental_meta\n     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN\n    RETURN NEW;\n  END IF;\n\n  IF OLD.status IN (''accepted'',''converted'') AND (');
  IF d = o THEN RAISE EXCEPTION 'lock_accepted_quote_amounts: patron no encontrado'; END IF;
  EXECUTE d;

  -- A3-05a: cancelar venta aceptada libera las unidades marcadas como vendidas
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='guard_quote_cancellation';
  o := d;
  d := replace(d,
    E'  END IF;\n  RETURN NEW;\nEND; ',
    E'    IF EXISTS (\n      SELECT 1 FROM public.quote_assigned_forklifts qaf\n      JOIN public.forklifts f ON f.id = qaf.forklift_id\n      WHERE qaf.quote_id = OLD.id AND f.status = ''sold''\n    ) THEN\n      IF EXISTS (\n        SELECT 1 FROM public.invoices i WHERE i.quote_id = OLD.id AND i.status <> ''cancelled''\n      ) THEN\n        RAISE EXCEPTION ''No se puede cancelar la cotizacion: la venta ya esta facturada. Cancela primero la factura.''\n          USING ERRCODE = ''check_violation'';\n      END IF;\n      PERFORM set_config(''app.forklift_rpc'', ''on'', true);\n      UPDATE public.forklifts f\n         SET status = ''available'', updated_at = now()\n        FROM public.quote_assigned_forklifts qaf\n       WHERE qaf.quote_id = OLD.id AND f.id = qaf.forklift_id AND f.status = ''sold'';\n      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)\n      SELECT qaf.forklift_id, ''sold'', ''available'', ''Venta cancelada: cotizacion '' || OLD.id::text\n        FROM public.quote_assigned_forklifts qaf WHERE qaf.quote_id = OLD.id;\n      PERFORM set_config(''app.forklift_rpc'', ''off'', true);\n      DELETE FROM public.quote_assigned_forklifts WHERE quote_id = OLD.id;\n    END IF;\n  END IF;\n  RETURN NEW;\nEND; ');
  IF d = o OR position('Venta cancelada' in d) = 0 THEN
    RAISE EXCEPTION 'guard_quote_cancellation: parche incompleto';
  END IF;
  EXECUTE d;
END
$mig$;

-- A3-01: RPC controlada para reasignar el cliente de una cotizacion aceptada
CREATE OR REPLACE FUNCTION public.reassign_quote_customer(
  p_quote_id uuid,
  p_customer_id uuid,
  p_customer_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
  v_status text;
BEGIN
  IF NOT (
    public.has_role(v_user, 'admin'::app_role)
    OR public.has_role(v_user, 'administrativo'::app_role)
    OR public.has_role(v_user, 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para reasignar el cliente de la cotizacion' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL OR COALESCE(btrim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Cliente invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_status FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Cotizacion no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se puede reasignar el cliente de una cotizacion aceptada (estado actual: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.quote_reassign_customer', 'on', true);
  UPDATE public.quotes
     SET customer_id = p_customer_id,
         customer_name = p_customer_name,
         updated_at = now()
   WHERE id = p_quote_id;
  PERFORM set_config('app.quote_reassign_customer', 'off', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reassign_quote_customer(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_quote_customer(uuid, uuid, text) TO authenticated;
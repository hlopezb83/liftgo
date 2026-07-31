DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.proname = 'get_dashboard_stats'
     AND p.pronamespace = 'public'::regnamespace;

  v_old := 'FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices GROUP BY status) sub';
  v_new := 'FROM (SELECT CASE WHEN i.status IN (''sent'', ''partial'', ''overdue'') AND COALESCE(i.cancellation_status, ''none'') <> ''accepted'' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE THEN ''overdue'' WHEN i.status = ''overdue'' THEN ''sent'' ELSE i.status END AS status, COUNT(*) as cnt, SUM(i.total) as sum_total FROM invoices i GROUP BY 1) sub';

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'R7-DB-02: no se encontró el bloque breakdown esperado en get_dashboard_stats';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

CREATE OR REPLACE FUNCTION public.guard_invoice_overdue_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'overdue' THEN
    IF NEW.due_date IS NULL THEN
      RAISE EXCEPTION 'Una factura vencida requiere fecha de vencimiento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.due_date >= CURRENT_DATE THEN
      RAISE EXCEPTION 'No se puede marcar como vencida una factura cuya fecha de vencimiento (%) aún no ha pasado.', NEW.due_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_overdue_due_date ON public.invoices;
CREATE TRIGGER trg_guard_invoice_overdue_due_date
BEFORE INSERT OR UPDATE OF status, due_date ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_overdue_due_date();
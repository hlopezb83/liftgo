-- BL-23: daily flip of supplier_bills to overdue without waiting for payment events.

CREATE OR REPLACE FUNCTION public.mark_overdue_supplier_bills()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.supplier_bills
     SET status = 'overdue', updated_at = now()
   WHERE status = 'pending'
     AND balance > 0
     AND due_date IS NOT NULL
     AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reverse: if due_date was pushed to the future (or cleared), return to pending.
  UPDATE public.supplier_bills
     SET status = 'pending', updated_at = now()
   WHERE status = 'overdue'
     AND (due_date IS NULL OR due_date >= CURRENT_DATE);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_overdue_supplier_bills() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_overdue_supplier_bills() TO service_role;

-- Idempotent daily schedule (same pattern as expire-stale-quotes-daily).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'mark-overdue-supplier-bills-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'mark-overdue-supplier-bills-daily',
  '10 7 * * *',
  $$SELECT public.mark_overdue_supplier_bills();$$
);
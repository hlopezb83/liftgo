-- R9-DB-01: una sola fuente de verdad para "hoy" en America/Monterrey.
CREATE OR REPLACE FUNCTION public.today_mty()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $$;

GRANT EXECUTE ON FUNCTION public.today_mty() TO authenticated, anon, service_role;

-- Reemplaza CURRENT_DATE (UTC) por public.today_mty() en las funciones de
-- reporte/validación afectadas, preservando el resto de la definición.
DO $do$
DECLARE
  r record;
  new_def text;
  targets text[] := ARRAY[
    'get_dashboard_stats','get_forklift_financials','get_insurance_alerts',
    'get_sidebar_badge_counts','expire_stale_quotes','mark_overdue_supplier_bills',
    'audit_fleet_status_consistency','guard_invoice_overdue_due_date',
    'guard_quote_acceptance','guard_quote_expired_rescue','guard_quote_valid_until',
    'validate_delivery_not_in_past','sync_forklift_on_booking_exit',
    'sync_forklift_on_booking_insert','sync_forklift_rental_status',
    'sync_forklift_status_on_maintenance','create_booking','cancel_booking',
    'convert_quote_to_bookings','accept_quote_from_portal','recalc_supplier_bill',
    'register_supplier_payment','sync_invoice_status_from_payments',
    'trg_supplier_bill_init_balance','validate_transition'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY(targets)
      AND pg_get_functiondef(p.oid) ~* '\mCURRENT_DATE\M'
  LOOP
    new_def := regexp_replace(r.def, '\mCURRENT_DATE\M', 'public.today_mty()', 'gi');
    EXECUTE new_def;
  END LOOP;
END
$do$;

-- Vista de facturas vencidas alineada a la misma fecha.
CREATE OR REPLACE VIEW public.v_overdue_invoices AS
SELECT i.id,
    i.invoice_number,
    i.customer_id,
    i.customer_name,
    i.due_date,
    i.total,
    COALESCE(v.balance, i.total) AS balance,
    COALESCE(v.balance_mxn, round(i.total * COALESCE(NULLIF(i.tipo_cambio, 0::numeric), 1::numeric), 2)) AS balance_mxn,
    public.today_mty() - i.due_date AS days_overdue,
    CASE
        WHEN (public.today_mty() - i.due_date) <= 30 THEN '0-30'::text
        WHEN (public.today_mty() - i.due_date) <= 60 THEN '31-60'::text
        WHEN (public.today_mty() - i.due_date) <= 90 THEN '61-90'::text
        ELSE '90+'::text
    END AS bucket
FROM invoices i
LEFT JOIN v_invoices_with_balance v ON v.id = i.id
WHERE (i.status = ANY (ARRAY['sent'::text, 'partial'::text, 'overdue'::text]))
  AND COALESCE(i.cancellation_status, 'none'::text) <> 'accepted'::text
  AND i.due_date IS NOT NULL
  AND i.due_date < public.today_mty()
  AND COALESCE(v.balance, i.total) > 0::numeric;
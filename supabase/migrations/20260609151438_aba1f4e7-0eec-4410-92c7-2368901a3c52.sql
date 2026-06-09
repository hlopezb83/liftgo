-- Backfill REP pendiente para pagos históricos asociados a facturas PPD
UPDATE public.supplier_payments AS sp
   SET rep_required = true,
       rep_status   = 'pending'
  FROM public.supplier_bills AS sb
 WHERE sp.bill_id = sb.id
   AND sb.payment_method_sat = 'PPD'
   AND COALESCE(sp.rep_required, false) = false
   AND COALESCE(sp.rep_status::text, 'not_required') NOT IN ('received', 'rejected');

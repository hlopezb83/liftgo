-- Projection only: pay/cn CTEs below are copied unchanged from current catalog view.
CREATE VIEW public.fixture_invoice_balance WITH (security_invoker = true) AS
WITH pay AS (
         SELECT p.invoice_id,
            sum(fx_convert_amount(p.amount, COALESCE(p.currency, ip.moneda, 'MXN'::text), COALESCE(ip.moneda, 'MXN'::text), NULLIF(p.exchange_rate, 0::numeric), NULLIF(ip.tipo_cambio, 0::numeric))) AS paid,
            count(*) FILTER (WHERE fx_convert_amount(p.amount, COALESCE(p.currency, ip.moneda, 'MXN'::text), COALESCE(ip.moneda, 'MXN'::text), NULLIF(p.exchange_rate, 0::numeric), NULLIF(ip.tipo_cambio, 0::numeric)) IS NULL)::integer AS fx_missing_payments
           FROM payments p
             JOIN invoices ip ON ip.id = p.invoice_id
          GROUP BY p.invoice_id
        ), cn AS (
         SELECT credit_notes.invoice_id,
            sum(credit_notes.total) AS credited
           FROM credit_notes
          WHERE credit_notes.cancellation_status <> 'accepted'::text AND credit_notes.status <> 'cancelled'::text AND credit_notes.cfdi_status = 'stamped'::text
          GROUP BY credit_notes.invoice_id
        )
SELECT i.id, i.invoice_number, i.total, i.moneda, i.tipo_cambio, i.status,
  COALESCE(pay.paid, 0::numeric) AS paid_amount,
  COALESCE(cn.credited, 0::numeric) AS credited_amount,
  GREATEST(i.total - COALESCE(pay.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
  COALESCE(pay.fx_missing_payments, 0) AS payments_fx_missing
FROM public.invoices i
LEFT JOIN pay ON pay.invoice_id = i.id
LEFT JOIN cn ON cn.invoice_id = i.id;
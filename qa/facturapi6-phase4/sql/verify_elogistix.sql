-- Facturapi 6 · verificación de los 4 CFDI de prueba de ELOGISTIX. SOLO LECTURA.
-- Reemplazar __WINDOW_START__ por la hora UTC de inicio de la ventana
-- (ej. 2026-11-11T13:00:00Z). No devuelve llaves, XML ni UUID completos.

-- 0. El tenant debe seguir en modo test.
SELECT facturapi_mode
FROM public.company_settings
WHERE organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38';

-- 1. Facturas A (PPD) y B (PUE, después cancelada).
SELECT id, folio, status, cfdi_status, facturapi_env, total,
       cfdi_uuid IS NOT NULL AS has_uuid,
       cfdi_pdf_url IS NOT NULL AS has_pdf,
       cfdi_xml_url IS NOT NULL AS has_xml,
       cancellation_status, cancelled_at IS NOT NULL AS cancelled,
       created_at
FROM public.invoices
WHERE organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'
  AND created_at >= TIMESTAMPTZ '__WINDOW_START__'
ORDER BY created_at;

-- 2. REP de la factura A.
SELECT id, invoice_id, amount, installment_number, prior_balance,
       rep_cfdi_status, rep_cfdi_uuid IS NOT NULL AS has_uuid,
       rep_pdf_url IS NOT NULL AS has_pdf, rep_xml_url IS NOT NULL AS has_xml,
       created_at
FROM public.payments
WHERE organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'
  AND created_at >= TIMESTAMPTZ '__WINDOW_START__'
ORDER BY created_at;

-- 3. Nota de crédito de la factura A.
SELECT id, status, cfdi_status, total,
       cfdi_uuid IS NOT NULL AS has_uuid,
       cfdi_pdf_url IS NOT NULL AS has_pdf, cfdi_xml_url IS NOT NULL AS has_xml,
       created_at
FROM public.credit_notes
WHERE organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'
  AND created_at >= TIMESTAMPTZ '__WINDOW_START__'
ORDER BY created_at;

-- 4. Cola de reintentos: sólo conteos (sin payload ni errores con datos).
SELECT organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38' AS is_test_tenant,
       operation, status, count(*) AS rows
FROM public.cfdi_retry_queue
WHERE created_at >= TIMESTAMPTZ '__WINDOW_START__'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

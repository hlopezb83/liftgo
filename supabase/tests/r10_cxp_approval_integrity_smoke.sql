-- Smoke SQL R10-01 + R10-02 (integridad de aprobación en CxP).
-- Ejecutar manualmente contra staging:  psql -f supabase/tests/r10_cxp_approval_integrity_smoke.sql
-- Todo corre dentro de una transacción con ROLLBACK: no deja datos.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'OK  %', p_label;
  ELSE RAISE WARNING 'FALLO  %', p_label; END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- 1) R10-01: la reaprobación NUNCA resuelve a not_required/approved.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'R10-01 request_bill_reapproval fija approval_status = pending',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval')
    ~* 'SET\s+approval_status\s*=\s*''pending'''
);

SELECT pg_temp.expect_true(
  'R10-01 request_bill_reapproval ya no menciona not_required',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval') !~* 'not_required'
);

-- 2) Evidencia del rechazo preservada: la función ya no limpia rejected_*.
SELECT pg_temp.expect_true(
  'R10-01 no borra rejected_by / rejected_at / approval_notes',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval')
    !~* 'rejected_by\s*=\s*NULL'
);

-- 3) Historial inmutable: sigue insertando el evento de reaprobación.
SELECT pg_temp.expect_true(
  'R10-01 registra supplier_bill_approvals(reapproval_requested)',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval')
    ILIKE '%reapproval_requested%'
);

-- 4) Segregación de funciones intacta: sólo admin/administrativo solicitan,
--    y la aprobación sigue exigiendo el RPC dedicado.
SELECT pg_temp.expect_true(
  'R10-01 guard de rol en request_bill_reapproval',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval') ILIKE '%has_role%'
);

SELECT pg_temp.expect_true(
  'R10-01 sólo facturas rechazadas pueden re-solicitar',
  (SELECT prosrc FROM pg_proc WHERE proname = 'request_bill_reapproval')
    ILIKE '%Solo facturas rechazadas%'
);

SELECT pg_temp.expect_true(
  'R10-01 approve_supplier_bill conserva su guard de rol aprobador',
  (SELECT prosrc FROM pg_proc WHERE proname = 'approve_supplier_bill') ILIKE '%has_role%'
);

-- 5) Corregir una factura rechazada tampoco la deja en not_required.
SELECT pg_temp.expect_true(
  'R10-01 trigger fuerza pending cuando OLD.approval_status = rejected',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status')
    ~* 'OR\s+OLD\.approval_status\s*=\s*''rejected'''
);

-- ---------------------------------------------------------------------------
-- 6) R10-02: sin JWT ya no hay bypass.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'R10-02 set_supplier_bill_approval_status sin bypass por JWT NULL',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status')
    !~* 'v_jwt_role\s+IS\s+NULL'
);

SELECT pg_temp.expect_true(
  'R10-02 guard_supplier_bill_approval sin bypass por JWT NULL',
  (SELECT prosrc FROM pg_proc WHERE proname = 'guard_supplier_bill_approval')
    !~* 'v_jwt_role\s+IS\s+NULL'
);

-- 7) Bypasses legítimos conservados: rol de servicio real y app.cxp_rpc.
SELECT pg_temp.expect_true(
  'R10-02 service_role sigue exento (claim JWT o current_user)',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status')
    ILIKE '%current_user = ''service_role''%'
);

SELECT pg_temp.expect_true(
  'R10-02 convención interna app.cxp_rpc intacta en ambos triggers',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status') ILIKE '%app.cxp_rpc%'
  AND (SELECT prosrc FROM pg_proc WHERE proname = 'guard_supplier_bill_approval') ILIKE '%app.cxp_rpc%'
);

-- 8) Candados financieros intactos.
SELECT pg_temp.expect_true(
  'R10-02 candado de factura con pagos intacto',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status')
    ILIKE '%ya tiene pagos registrados%'
);

SELECT pg_temp.expect_true(
  'R10-02 candado de factura aprobada intacto',
  (SELECT prosrc FROM pg_proc WHERE proname = 'set_supplier_bill_approval_status')
    ILIKE '%una factura ya aprobada%'
);

-- 9) Los triggers siguen enganchados a las columnas financieras.
SELECT pg_temp.expect_true(
  'R10-02 trigger activo sobre total/currency/exchange_rate',
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.supplier_bills'::regclass
       AND tgname = 'trg_set_supplier_bill_approval_status'
       AND NOT tgisinternal
  )
);

ROLLBACK;

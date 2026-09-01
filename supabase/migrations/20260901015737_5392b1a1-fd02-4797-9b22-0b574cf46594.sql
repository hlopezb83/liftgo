DO $mig$
DECLARE
  v_def text;
  v_old_pred text := '    WHERE d.date_key IS NULL
      AND oe.supplier_bill_id IS NULL';
  v_new_pred text := '    WHERE d.date_key IS NULL
      AND (
        oe.supplier_bill_id IS NULL
        OR oe.supplier_bill_id NOT IN (SELECT id FROM contributing_bill_ids)
      )';
  v_old_cte text := '  oe_dedup AS (';
  v_new_cte text := '  contributing_bill_ids AS (
    SELECT DISTINCT sb.id
    FROM sb_base sb
    WHERE (
        p_basis = ''accrual''
        AND (
          ((sb.coverage_start IS NULL OR sb.coverage_end IS NULL)
            AND sb.issue_date BETWEEN p_start_date AND p_end_date)
          OR (sb.coverage_start IS NOT NULL AND sb.coverage_end IS NOT NULL
            AND sb.coverage_start <= p_end_date AND sb.coverage_end >= p_start_date)
        )
      )
      OR (
        p_basis = ''cash''
        AND EXISTS (
          SELECT 1 FROM supplier_payments sp
          WHERE sp.bill_id = sb.id
            AND sp.payment_date BETWEEN p_start_date AND p_end_date
        )
      )
  ),
  oe_dedup AS (';
BEGIN
  v_def := pg_get_functiondef('public.get_income_statement(date,date,text)'::regprocedure);

  IF position(v_old_pred IN v_def) = 0 THEN
    RAISE EXCEPTION 'R7-10: no se encontro el predicado de oe_dedup esperado';
  END IF;
  IF position(v_old_cte IN v_def) = 0 THEN
    RAISE EXCEPTION 'R7-10: no se encontro la CTE oe_dedup esperada';
  END IF;
  IF position('contributing_bill_ids' IN v_def) > 0 THEN
    RAISE NOTICE 'R7-10: ya aplicado, sin cambios';
    RETURN;
  END IF;

  v_def := replace(v_def, v_old_cte, v_new_cte);
  v_def := replace(v_def, v_old_pred, v_new_pred);

  EXECUTE v_def;
END
$mig$;

COMMENT ON FUNCTION public.get_income_statement(date, date, text) IS
  'Estado de Resultados. R7-10: los gastos operativos ligados a una factura de proveedor solo se deduplican cuando esa factura realmente aporta al periodo/base consultada.';
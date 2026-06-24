-- Limpieza de facturas costo_venta duplicadas con el COGS automático del RPC get_income_statement.
-- El RPC contabiliza cogs_forklift_sales para cada forklift con status='sold' y acquisition_cost>0
-- en el mes de su sold_at (status_logs.to_status='sold' o fallback a updated_at).
-- Las facturas con category='costo_venta' creadas históricamente por insertCostoVentaIfSold (ya removido)
-- duplican ese costo. Las eliminamos cuando apuntan a un forklift que el RPC ya cuenta.
-- supplier_payments tiene FK ON DELETE CASCADE, así que los pagos asociados se eliminan en consecuencia.

WITH dupes AS (
  SELECT sb.id
  FROM public.supplier_bills sb
  JOIN public.forklifts f
    ON sb.description ILIKE 'Costo de venta: ' || f.name
  WHERE sb.category = 'costo_venta'
    AND f.status = 'sold'
    AND f.acquisition_cost IS NOT NULL
    AND f.acquisition_cost > 0
    AND COALESCE(f.is_e2e, false) = false
)
DELETE FROM public.supplier_bills
WHERE id IN (SELECT id FROM dupes);
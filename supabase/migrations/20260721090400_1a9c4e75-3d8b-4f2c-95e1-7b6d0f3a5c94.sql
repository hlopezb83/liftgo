-- ============================================================================
-- BL: report_profit_by_model sub-reportaba revenue. La función solo ligaba
-- facturas vía invoices.booking_id; las facturas multi-reserva (booking_id
-- NULL, vínculo en la pivote invoice_bookings) desaparecían del reporte.
-- Se recrea la función incluyendo la pivote en el join de revenue:
--   - vínculo directo (mono-reserva): total completo al modelo de la unidad.
--   - vínculo pivote (multi-reserva): prorrateo equitativo del total entre
--     las reservas vinculadas para no inflar el revenue consolidado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.report_profit_by_model(_start date, _end date)
RETURNS TABLE (
  model text,
  units integer,
  revenue numeric,
  maintenance numeric,
  damages numeric,
  profit numeric,
  margin numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH forklift_model AS (
    SELECT
      f.id,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', f.manufacturer, f.model)), ''), f.name) AS model_key
    FROM public.forklifts f
  ),
  model_units AS (
    SELECT model_key, COUNT(*)::int AS units
    FROM forklift_model
    GROUP BY model_key
  ),
  revenue_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(link.revenue_share), 0) AS revenue
    FROM (
      -- Vínculo directo: factura de una sola reserva. Si la factura también
      -- tiene filas en la pivote (no debería), gana la pivote para no
      -- duplicar el revenue.
      SELECT b.forklift_id, i.total AS revenue_share
      FROM public.invoices i
      JOIN public.bookings b ON b.id = i.booking_id
      WHERE i.status = 'paid'
        AND i.paid_at IS NOT NULL
        AND i.paid_at::date BETWEEN _start AND _end
        AND NOT EXISTS (
          SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id = i.id
        )
      UNION ALL
      -- Vínculo pivote: factura multi-reserva (booking_id NULL). Prorrateo
      -- equitativo entre las reservas vinculadas para conservar el total.
      SELECT b.forklift_id,
             i.total / COUNT(*) OVER (PARTITION BY i.id) AS revenue_share
      FROM public.invoices i
      JOIN public.invoice_bookings ib ON ib.invoice_id = i.id
      JOIN public.bookings b ON b.id = ib.booking_id
      WHERE i.status = 'paid'
        AND i.paid_at IS NOT NULL
        AND i.paid_at::date BETWEEN _start AND _end
    ) link
    JOIN forklift_model fm ON fm.id = link.forklift_id
    GROUP BY fm.model_key
  ),
  maintenance_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(ml.cost), 0) AS maintenance
    FROM public.maintenance_logs ml
    JOIN forklift_model fm ON fm.id = ml.forklift_id
    WHERE ml.performed_at IS NOT NULL
      AND ml.performed_at::date BETWEEN _start AND _end
    GROUP BY fm.model_key
  ),
  damages_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(dr.actual_cost), 0) AS damages
    FROM public.damage_records dr
    JOIN forklift_model fm ON fm.id = dr.forklift_id
    WHERE dr.created_at IS NOT NULL
      AND dr.created_at::date BETWEEN _start AND _end
    GROUP BY fm.model_key
  )
  SELECT
    mu.model_key                                                     AS model,
    mu.units                                                         AS units,
    COALESCE(r.revenue, 0)                                           AS revenue,
    COALESCE(m.maintenance, 0)                                       AS maintenance,
    COALESCE(d.damages, 0)                                           AS damages,
    (COALESCE(r.revenue, 0) - COALESCE(m.maintenance, 0) - COALESCE(d.damages, 0)) AS profit,
    CASE
      WHEN COALESCE(r.revenue, 0) > 0
        THEN ROUND(((COALESCE(r.revenue, 0) - COALESCE(m.maintenance, 0) - COALESCE(d.damages, 0)) / r.revenue) * 100, 2)
      ELSE 0
    END                                                              AS margin
  FROM model_units mu
  LEFT JOIN revenue_by_model  r ON r.model_key = mu.model_key
  LEFT JOIN maintenance_by_model m ON m.model_key = mu.model_key
  LEFT JOIN damages_by_model  d ON d.model_key = mu.model_key
  ORDER BY profit DESC;
$$;

REVOKE ALL ON FUNCTION public.report_profit_by_model(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_profit_by_model(date, date) TO authenticated;

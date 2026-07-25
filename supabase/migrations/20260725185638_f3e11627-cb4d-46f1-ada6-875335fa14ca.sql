-- Tanda 3 P1-5: vista para /fleet
-- Hoy FleetPage descarga contracts (con `content` completo), deliveries y
-- maintenance_policies sin límite solo para derivar 2 campos por equipo.
-- La vista reemplaza esos 3 requests por 1 con payload mínimo.
--
-- security_invoker=true → cada usuario ve solo lo que sus RLS le permiten
-- sobre contracts/deliveries/maintenance_policies (no bypass).
CREATE OR REPLACE VIEW public.forklift_current_location
WITH (security_invoker = true)
AS
WITH contract_loc AS (
  SELECT DISTINCT ON (c.forklift_id)
    c.forklift_id,
    c.usage_location,
    c.customer_id
  FROM public.contracts c
  WHERE c.forklift_id IS NOT NULL
    AND c.status IN ('active', 'signed')
    AND c.usage_location IS NOT NULL
    AND c.usage_location <> ''
  ORDER BY c.forklift_id, c.created_at DESC
),
delivery_loc AS (
  SELECT DISTINCT ON (d.forklift_id)
    d.forklift_id,
    d.address
  FROM public.deliveries d
  WHERE d.status = 'completed'
    AND d.address IS NOT NULL
    AND d.address <> ''
  ORDER BY d.forklift_id, d.completed_at DESC NULLS LAST
),
active_policy AS (
  SELECT forklift_id
  FROM public.maintenance_policies
  WHERE is_active = true
)
SELECT
  f.id AS forklift_id,
  COALESCE(c.usage_location, dl.address) AS location,
  (ap.forklift_id IS NOT NULL) AS has_active_policy
FROM public.forklifts f
LEFT JOIN contract_loc c ON c.forklift_id = f.id
LEFT JOIN delivery_loc dl ON dl.forklift_id = f.id
LEFT JOIN active_policy ap ON ap.forklift_id = f.id;

GRANT SELECT ON public.forklift_current_location TO authenticated;
GRANT ALL ON public.forklift_current_location TO service_role;
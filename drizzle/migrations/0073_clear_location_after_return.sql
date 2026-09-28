-- A completed pickup records the customer's pickup address, not the yard to
-- which the equipment was returned. A completed inspection also closes the
-- last known customer location. Do not present either as the current site.
-- The view remains SECURITY INVOKER so each source retains organization RLS.
CREATE OR REPLACE VIEW public.forklift_current_location
WITH (security_invoker = true)
AS
WITH contract_loc AS (
  SELECT DISTINCT ON (c.forklift_id)
    c.forklift_id, c.organization_id, c.usage_location
  FROM public.contracts c
  WHERE c.forklift_id IS NOT NULL
    AND c.status IN ('active', 'signed')
    AND c.usage_location IS NOT NULL
    AND btrim(c.usage_location) <> ''
  ORDER BY c.forklift_id, c.created_at DESC
), location_events AS (
  SELECT d.forklift_id, d.organization_id,
    d.type AS event_kind,
    d.address,
    COALESCE(d.completed_at, d.updated_at, d.created_at) AS occurred_at,
    d.created_at AS recorded_at
  FROM public.deliveries d
  WHERE d.status = 'completed'
    AND d.type IN ('delivery', 'pickup', 'return')
  UNION ALL
  SELECT ri.forklift_id, ri.organization_id,
    'inspection'::text AS event_kind,
    NULL::text AS address,
    COALESCE(ri.inspected_at, ri.created_at) AS occurred_at,
    ri.created_at AS recorded_at
  FROM public.return_inspections ri
), latest_event AS (
  SELECT DISTINCT ON (e.forklift_id)
    e.forklift_id, e.organization_id, e.event_kind, e.address
  FROM location_events e
  ORDER BY e.forklift_id, e.occurred_at DESC NULLS LAST,
    e.recorded_at DESC NULLS LAST,
    CASE WHEN e.event_kind = 'delivery' THEN 1 ELSE 0 END
), active_policy AS (
  SELECT forklift_id
  FROM public.maintenance_policies
  WHERE is_active = true
)
SELECT
  f.id AS forklift_id,
  CASE WHEN le.event_kind IN ('pickup', 'return', 'inspection') THEN NULL
    ELSE COALESCE(c.usage_location, NULLIF(btrim(le.address), ''))
  END AS location,
  (ap.forklift_id IS NOT NULL) AS has_active_policy
FROM public.forklifts f
LEFT JOIN contract_loc c
  ON c.forklift_id = f.id AND c.organization_id = f.organization_id
LEFT JOIN latest_event le
  ON le.forklift_id = f.id AND le.organization_id = f.organization_id
LEFT JOIN active_policy ap ON ap.forklift_id = f.id;

GRANT SELECT ON public.forklift_current_location TO authenticated;
GRANT ALL ON public.forklift_current_location TO service_role;

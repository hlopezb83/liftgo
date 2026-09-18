-- Helper: unidades de venta pendientes de asignar en una cotización.
-- Espejo exacto de useQuoteSaleAssignmentStatus (frontend):
--   partida de venta  = descripción que termina en "- Venta de equipo" (case-insensitive)
--   requerido         = quantity (0/NULL => 1)
--   asignado          = # de quote_assigned_forklifts con ese line_index
CREATE OR REPLACE FUNCTION public.quote_sale_units_unassigned(p_quote_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lines AS (
    SELECT (t.ord - 1)::int AS line_index,
           ceil(coalesce(nullif((t.item->>'quantity')::numeric, 0), 1))::int AS required
      FROM public.quotes q
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.line_items, '[]'::jsonb))
           WITH ORDINALITY AS t(item, ord)
     WHERE q.id = p_quote_id
       AND coalesce(t.item->>'description', '') ~* '-\s*Venta de equipo$'
  ), asg AS (
    SELECT line_index, count(*)::int AS assigned
      FROM public.quote_assigned_forklifts
     WHERE quote_id = p_quote_id
     GROUP BY line_index
  )
  SELECT coalesce(sum(greatest(l.required - coalesce(a.assigned, 0), 0)), 0)::int
    FROM lines l
    LEFT JOIN asg a ON a.line_index = l.line_index;
$$;

REVOKE ALL ON FUNCTION public.quote_sale_units_unassigned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_sale_units_unassigned(uuid) TO authenticated, service_role;

-- Guard: sólo el alta de facturas ligadas a una cotización con partidas de venta.
CREATE OR REPLACE FUNCTION public.guard_invoice_sale_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing integer;
BEGIN
  IF NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sembrado E2E: misma convención que los demás guards del repo.
  IF coalesce(current_setting('app.e2e_seed', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  v_missing := public.quote_sale_units_unassigned(NEW.quote_id);

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'No se puede facturar: la cotización de venta tiene % equipo(s) sin asignar', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_sale_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_invoice_sale_assignment ON public.invoices;
CREATE TRIGGER trg_guard_invoice_sale_assignment
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_sale_assignment();
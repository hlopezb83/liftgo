-- The wrapper delegates authorization and booking creation to the scoped RPC.
-- This fixture provides only the downstream write and failure boundary.
CREATE TYPE public.app_role AS ENUM ('admin', 'administrativo', 'ventas');
CREATE FUNCTION public.has_role(p_user uuid, p_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = p_role::text)
$$;
CREATE TABLE public.organization_customers (
  organization_id uuid NOT NULL, customer_id uuid NOT NULL, status text NOT NULL, alias text, razon_social text
);
ALTER TABLE public.organization_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_local_customers ON public.organization_customers FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_internal_organization_id()));
ALTER TABLE public.quotes ADD COLUMN updated_at timestamptz;
CREATE POLICY fixture_quote_update ON public.quotes FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_internal_organization_id()));
GRANT SELECT ON public.organization_customers TO authenticated;
GRANT UPDATE ON public.quotes TO authenticated;

CREATE FUNCTION public.convert_quote_to_bookings_scoped(p_quote_id uuid, p_assignments jsonb, p_recurring boolean)
RETURNS TABLE(booking_id uuid, forklift_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fixture$
DECLARE q public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO STRICT q FROM public.quotes WHERE id = p_quote_id
    AND organization_id = public.current_internal_organization_id() AND status = 'accepted';
  IF jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'fixture conversion failed' USING ERRCODE = '23514';
  END IF;
  RETURN QUERY INSERT INTO public.bookings AS b (
    id, organization_id, forklift_id, start_date, end_date, customer_id, customer_name, status, recurring_billing
  ) SELECT gen_random_uuid(), q.organization_id, (item->>'forklift_id')::uuid,
    q.start_date, q.end_date, q.customer_id, q.customer_name, 'confirmed', p_recurring
    FROM jsonb_array_elements(p_assignments) AS item
  RETURNING b.id, b.forklift_id;
END;
$fixture$;

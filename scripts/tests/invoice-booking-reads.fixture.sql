CREATE TABLE public.forklifts(id uuid PRIMARY KEY, organization_id uuid NOT NULL, name text, model text);
CREATE TABLE public.bookings(
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, forklift_id uuid NOT NULL REFERENCES forklifts(id),
  start_date date NOT NULL, end_date date NOT NULL, customer_id uuid, customer_name text,
  status text NOT NULL, booking_number text, is_e2e boolean
);
CREATE TABLE public.invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id), status text NOT NULL, line_items jsonb NOT NULL,
  moneda text, billing_period_start date, billing_period_end date
);
CREATE TABLE public.invoice_bookings(
  invoice_id uuid REFERENCES invoices(id), booking_id uuid REFERENCES bookings(id), PRIMARY KEY(invoice_id, booking_id)
);
CREATE INDEX ON public.invoices(booking_id);
CREATE INDEX ON public.invoice_bookings(booking_id);
CREATE TABLE public.booking_extensions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, booking_id uuid NOT NULL REFERENCES bookings(id),
  original_end_date date NOT NULL, new_end_date date NOT NULL, invoice_id uuid, pending_invoice_id uuid
);
CREATE TABLE public.return_inspections(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, booking_id uuid NOT NULL REFERENCES bookings(id),
  forklift_id uuid NOT NULL, inspected_at timestamptz NOT NULL
);

ALTER TABLE public.forklifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_tenant ON public.forklifts FOR SELECT TO authenticated USING (organization_id = (SELECT public.current_internal_organization_id()));
CREATE POLICY fixture_tenant ON public.bookings FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_internal_organization_id()) AND booking_number IS DISTINCT FROM 'HIDDEN');
CREATE POLICY fixture_tenant ON public.invoices FOR SELECT TO authenticated USING (organization_id = (SELECT public.current_internal_organization_id()));
CREATE POLICY fixture_invoice ON public.invoice_bookings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_bookings.invoice_id));
CREATE POLICY fixture_tenant ON public.booking_extensions FOR SELECT TO authenticated USING (organization_id = (SELECT public.current_internal_organization_id()));
CREATE POLICY fixture_tenant ON public.return_inspections FOR SELECT TO authenticated USING (organization_id = (SELECT public.current_internal_organization_id()));
GRANT SELECT ON public.forklifts, public.bookings, public.invoices, public.invoice_bookings,
  public.booking_extensions, public.return_inspections TO authenticated;

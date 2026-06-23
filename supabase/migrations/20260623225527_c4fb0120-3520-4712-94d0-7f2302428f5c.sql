
CREATE TABLE public.invoice_bookings (
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  line_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, booking_id)
);

CREATE INDEX idx_invoice_bookings_booking ON public.invoice_bookings(booking_id);
CREATE INDEX idx_invoice_bookings_invoice ON public.invoice_bookings(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_bookings TO authenticated;
GRANT ALL ON public.invoice_bookings TO service_role;

ALTER TABLE public.invoice_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access invoice_bookings" ON public.invoice_bookings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access invoice_bookings" ON public.invoice_bookings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access invoice_bookings" ON public.invoice_bookings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Auditor read invoice_bookings" ON public.invoice_bookings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

-- Backfill: copy current invoices.booking_id into pivot
INSERT INTO public.invoice_bookings (invoice_id, booking_id, line_index)
SELECT id, booking_id, 0 FROM public.invoices WHERE booking_id IS NOT NULL
ON CONFLICT DO NOTHING;

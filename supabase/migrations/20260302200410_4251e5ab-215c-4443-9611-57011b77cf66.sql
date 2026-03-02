ALTER TABLE public.bookings ADD COLUMN quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_quote_id ON public.bookings(quote_id);
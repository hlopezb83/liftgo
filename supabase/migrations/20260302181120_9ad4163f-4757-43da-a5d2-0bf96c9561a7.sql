
-- Add quote_id to invoices to track origin
ALTER TABLE public.invoices ADD COLUMN quote_id uuid REFERENCES public.quotes(id);

-- Create index for lookups
CREATE INDEX idx_invoices_quote_id ON public.invoices(quote_id);

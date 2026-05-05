CREATE TABLE public.invoice_number_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_next_number int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_number_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access invoice_number_settings"
ON public.invoice_number_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access invoice_number_settings"
ON public.invoice_number_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

INSERT INTO public.invoice_number_settings (min_next_number) VALUES (57);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  SELECT 'FAC-' || lpad(
    GREATEST(
      coalesce(max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::int), 0) + 1,
      coalesce((SELECT min_next_number FROM public.invoice_number_settings LIMIT 1), 1)
    )::text, 4, '0')
  FROM public.invoices;
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT 'FAC-' || lpad((coalesce(max(
    nullif(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM invoices;
$function$;

CREATE OR REPLACE FUNCTION public.next_quote_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT 'COT-' || lpad((coalesce(max(
    nullif(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM quotes;
$function$;

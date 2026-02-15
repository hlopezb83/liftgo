
CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'CTR-' || lpad((coalesce(max(substring(contract_number from 5)::int), 0) + 1)::text, 4, '0')
  FROM public.contracts;
$$;

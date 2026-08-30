-- Convención del repo: los helpers de guards no se exponen a la Data API.
REVOKE EXECUTE ON FUNCTION public.quote_sale_units_unassigned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_sale_units_unassigned(uuid) TO service_role;
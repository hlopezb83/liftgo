-- Los contadores de abuso son infraestructura global del servidor. Su clave
-- (bucket, identifier) limita al usuario incluso si opera en varias empresas.
-- Solo service_role puede escribir mediante check_and_record_rate_limit;
-- no deben heredar una organización del trigger de datos de negocio.
DROP TRIGGER IF EXISTS trg_organization_write_context ON public.rate_limits;

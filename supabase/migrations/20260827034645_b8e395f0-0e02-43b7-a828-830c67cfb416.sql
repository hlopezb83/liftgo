-- R5-07: el seeding E2E queda apagado por defecto también en la base actual.
-- El DEFAULT de la columna ya es false; esto normaliza las filas existentes.
UPDATE public.company_settings SET allow_e2e_seed = false WHERE allow_e2e_seed IS DISTINCT FROM false;
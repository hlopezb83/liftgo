-- ============================================================================
-- FORCE ROW LEVEL SECURITY en las 11 tablas sensibles restantes.
--
-- Contexto: hasta hoy solo public.company_settings tenia FORCE RLS
-- (migracion 20260811211228). El resto tiene RLS habilitado pero NO forzado,
-- por lo que el dueno de la tabla (postgres) queda exento de las policies.
--
-- VERIFICACION PREVIA (documentada aqui para auditoria):
--   1) Dueno de las 11 tablas = postgres, que tiene rolbypassrls = true.
--      FORCE RLS no aplica a roles con BYPASSRLS, asi que las migraciones y
--      los trabajos administrativos que corren como postgres siguen igual.
--   2) Edge functions: usan getAdminClient() (SUPABASE_SERVICE_ROLE_KEY, rol
--      service_role con rolbypassrls = true) para trabajo administrativo, o
--      getCallerClient() (anon key + Authorization del usuario), que ya estaba
--      sujeto a RLS. Ninguna depende del bypass por propiedad de tabla.
--   3) Triggers: todas las funciones de trigger que escriben en OTRAS tablas
--      (audit_trigger_fn, log_activity, notify_payment_received,
--      sync_invoice_status_from_payments, trg_supplier_payment_recalc,
--      recalc_supplier_bill_balance_on_total_change, etc.) son
--      SECURITY DEFINER propiedad de postgres -> conservan el bypass.
--      Las funciones SECURITY INVOKER solo tocan NEW/OLD o leen, y ya corrian
--      con el rol del llamante bajo RLS.
--   4) No existen seeds de runtime que dependan de escribir como dueno de tabla;
--      los INSERT de datos viven en migraciones, que corren como postgres.
--
-- Efecto neto: defensa en profundidad. Si en el futuro alguna funcion deja de
-- ser SECURITY DEFINER, o si se crea un rol dueno sin BYPASSRLS, las policies
-- se seguiran aplicando en lugar de abrirse silenciosamente.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- Este cambio es reversible y no destructivo: no altera datos, policies ni
-- grants. Para revertirlo, ejecutar en una migracion nueva:
--
--   ALTER TABLE public.billing_secrets   NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.invoices          NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.payments          NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.supplier_payments NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.supplier_bills    NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.profiles          NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.user_roles        NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.role_permissions  NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.audit_logs        NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.contracts         NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.customers         NO FORCE ROW LEVEL SECURITY;
--
-- Sintoma que justificaria el rollback: un job o trigger que corra como dueno
-- de tabla SIN bypassrls empiece a fallar con "new row violates row-level
-- security policy" o a devolver 0 filas. La correccion preferida en ese caso
-- es marcar esa funcion como SECURITY DEFINER con SET search_path = public,
-- no desactivar FORCE.
--
-- Verificacion post-migracion:
--   SELECT relname, relrowsecurity, relforcerowsecurity
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;
-- ============================================================================

-- Secretos fiscales (PAC / llaves): nadie los lee desde el cliente.
ALTER TABLE public.billing_secrets FORCE ROW LEVEL SECURITY;

-- Ciclo de ingresos.
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

-- Cuentas por pagar.
ALTER TABLE public.supplier_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments FORCE ROW LEVEL SECURITY;

-- Identidad, autorizacion y bitacora.
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
-- =====================================================================
-- Multiempresa · cierre de la superficie anónima en funciones de public
--
-- Causa raíz (documentada por supabase/tests/rls/function_acl_contract.sql):
-- Supabase ejecuta
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- por lo que TODA función nueva de public nace con EXECUTE concedido
-- DIRECTAMENTE al rol anon en su ACL almacenado, aunque la migración haya
-- hecho REVOKE ALL ... FROM PUBLIC. Son dos entradas distintas del ACL:
-- revocar PUBLIC no toca el grant directo a anon y viceversa.
--
-- El CI limpio del commit 62a84ab23525c1d2311afb919da241e6a143820e reportó,
-- sobre una base efímera con el historial Supabase + Drizzle hasta 0027:
--   · 22 firmas con entrada ACL almacenada directa a anon,
--   ·  7 de esas 22 además con entrada ACL almacenada a PUBLIC,
--   ·  0 casos de proacl IS NULL (ACL predeterminado con PUBLIC),
--   ·  0 casos de privilegio efectivo por otra vía.
--
-- Clasificación de las 22 (auditoría estática, solo lectura):
--   · Triggers: nunca se invocan como RPC; PostgreSQL no exige EXECUTE al
--     invocante para disparar un trigger.
--   · Helpers de policies: se evalúan dentro de policies TO authenticated y
--     conservan su GRANT propio a authenticated/service_role.
--   · RPC internas (CxP, inspecciones de devolución): UI autenticada.
--   · RPC del portal (accept/reject_quote_from_portal): el portal usa login
--     Supabase real (signInWithPassword); ambas abortan con 'No autorizado'
--     si auth.uid() es NULL, así que no existe caller anónimo.
--
-- Este archivo SOLO revoca. No cambia cuerpos, ni roles, ni default
-- privileges, ni agrega GRANT nuevos: las concesiones legítimas a
-- authenticated / service_role permanecen intactas.
-- Verificación: supabase/tests/rls/function_acl_revoke_anon_0028.sql
-- =====================================================================

-- ── 1. Triggers (no se invocan como RPC) ─────────────────────────────
REVOKE EXECUTE ON FUNCTION public.enforce_extension_invoice_link() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_membership_portal_account() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_portal_account_membership() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_organization_write_context() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_single_active_organization_customer() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_credit_note_delete() FROM anon;

-- ── 2. Helpers de policies (evaluados como authenticated) ────────────
REVOKE EXECUTE ON FUNCTION public.current_organization_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_portal_customer_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_in_current_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.organization_scope_matches(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoice_in_current_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoice_eligible_for_payment_intent(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.storage_prefix_organization(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.storage_path_in_current_organization(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.payment_proof_path_allowed(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.storage_document_owned_by_other_organization(text) FROM anon;
-- storage_relative_segments es el único helper que además conserva la entrada
-- explícita a PUBLIC (0021 no hizo REVOKE ... FROM PUBLIC).
REVOKE EXECUTE ON FUNCTION public.storage_relative_segments(text) FROM anon, PUBLIC;

-- ── 3. RPC internas (UI autenticada) ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, numeric, date, text, text, text, text, text, uuid
) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.correct_return_inspection(
  uuid, text, text, text, numeric, numeric, text
) FROM anon;

-- ── 4. RPC del portal (sesión autenticada obligatoria) ───────────────
REVOKE EXECUTE ON FUNCTION public.accept_quote_from_portal(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_quote_from_portal(uuid, text) FROM anon, PUBLIC;

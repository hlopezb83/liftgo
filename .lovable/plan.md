# Auditoría de solo lectura: alcance del hallazgo "anon con EXECUTE" (post 8.10.6)

Análisis estático del repositorio. No se ejecutó SQL, no se tocó producción, no se modificó código, changelog ni roadmap.

## Resumen del hallazgo sistémico

Supabase aplica `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role`. Por eso:

- Toda función **nueva** de `public` nace con `EXECUTE` **directo** para `anon` en su `proacl`.
- `REVOKE ALL ... FROM PUBLIC` **no** quita ese permiso directo: hace falta `REVOKE ... FROM anon`.
- `CREATE OR REPLACE` sobre una función preexistente **conserva** el ACL anterior y no reaplica default privileges.

En el repo existieron tres barridos que sí revocaron a `anon` en masa:

- `supabase/migrations/20260512012320_a18cc207-….sql:18`
- `supabase/migrations/20260512012348_16d94ecc-….sql:14`
- `supabase/migrations/20260527060401_fd1493bf-….sql:19` (último barrido, `SECURITY DEFINER` en `public`, `FROM anon, PUBLIC`)

**Consecuencia:** toda firma `SECURITY DEFINER` **creada por primera vez después del 2026-05-27** conserva `EXECUTE` directo para `anon` salvo que una migración posterior la revoque nominalmente. El escaneo estático encuentra **250 firmas** en ese rango (127 invocables como RPC, 123 funciones de trigger).

## Inventario priorizado

### A. Riesgo alto — RPC sin REVOKE de anon y sin autorización interna

Ninguna comprueba `auth.uid()`, rol ni organización dentro del cuerpo; si `anon` conserva EXECUTE son invocables vía `/rest/v1/rpc/...` con la publishable key.

| Función | Archivo:línea (creación) | REVOKE anon | Nota |
|---|---|---|---|
| `report_revenue_month_invoices(text)` | `supabase/migrations/20260810184205_…:25` | no (solo `FROM PUBLIC`, :38) | lectura agregada de facturas |
| `report_utilization_by_unit(date,date)` | `…20260810184205_…:41` | no (:61 solo PUBLIC) | |
| `report_utilization_by_model(date,date)` | `…20260810184205_…:64` | no | |
| `report_maintenance_cost_by_unit(...)` | `…20260810184205_…:101` | no | |
| `report_profit_by_model(...)` | `supabase/migrations/20260720172245_…:1` | no | |
| `lock_invoice_for_rep(uuid)` | `supabase/migrations/20260721090600_…:13` | no (:33 solo PUBLIC; grant solo service_role) | escritura/bloqueo |
| `reconcile_stamping_invoice(...)` | `supabase/migrations/20260720154604_…:5` | no | escritura fiscal |
| `next_draft_invoice_number()` / `peek_next_draft_invoice_number()` | `supabase/migrations/20260702174414_…:5,14` | no | consume folio |
| `next_draft_credit_note_number()` / `peek_…()` | `supabase/migrations/20260707201153_…:4,13` | no | consume folio |
| `mark_overdue_supplier_bills()` | `supabase/migrations/20260719171935_…:3` | no | escritura masiva |
| `purge_old_notifications()` | `supabase/migrations/20260719170150_…:15` | no | borrado |
| `delete_quote_with_unassign(...)` | `supabase/migrations/20260529005136_…:2` | no | borrado |
| `get_activity_metrics(...)` | `supabase/migrations/20260614010108_…:2` | no | lectura agregada |
| `get_portal_collection_account(...)` | `supabase/migrations/20260609200459_…:153` | no | datos bancarios |
| `e2e_purge_all`, `next_*_number_e2e` | `supabase/migrations/20260610171252_…:46,54,62,213` | no | utilería E2E en producción |

### B. Riesgo medio — RPC sin REVOKE de anon pero con autorización interna

Fallan cerrado por `auth.uid() IS NULL` / `has_role` / `current_organization_id()`, pero el ACL contradice el contrato y son superficie innecesaria: `accept_quote_from_portal`, `reject_quote_from_portal` (`…20260609200459_…:88,122`), `approve_payment_intent` / `reject_payment_intent` (`…20260719162221_…:39,85`), `convert_quote_to_bookings` (`…20260719164315_…:2`), `register_supplier_payment` (`…20260608221347_…:218`), `create_supplier_payment_batch` (`…20260609185156_…:81`), `list_invoices_with_balance` (`…20260718061631_…:8`), `upsert_billing_secret` (`…20260723204610_…:24`), `unmatch_bank_line`, `mark_supplier_rep_rejected`, `reset_supplier_rep_pending`, `start_repair_work_order`, `has_permission`, `customer_owns_invoice`, más los helpers de la cadena multiempresa aún **no aplicados**: `organization_scope_matches` (0005:10), `storage_*` (0021:4, 0022:20/36/85), `invoice_in_current_organization` (0022:62), `invoice_eligible_for_payment_intent` (0023:1), `is_internal_member` / `user_in_current_organization` (0025:42,60), `storage_document_owned_by_other_organization` (0027:359). Todas llevan solo `REVOKE ... FROM PUBLIC`.

### C. Protegidas (control positivo)

`assign_stamped_rep_number(uuid,text,uuid)` y `(uuid,text)` con `REVOKE ... FROM anon` explícito en `drizzle/migrations/0026_…:133,167`; el lote `supabase/migrations/20260811211403_…:334-342` (`FROM PUBLIC, anon` + grants a `authenticated, service_role`) cubre `assert_invoice_cancellable`, `peek_next_invoice_number`, `assign_stamped_invoice_number`, `assign_stamped_credit_note_number`, `claim_maintenance_policy_month`, `has_active_rental`, `get_available_forklifts`. También hay revokes nominales en `soft_delete_*`, `restore_*`, `update_user_role_safe`, `assert_not_last_admin`, `revoke_user_sessions`, `check_and_record_rate_limit`.

### C-bis. Falsos positivos descartados

`has_role(uuid, app_role)` (`supabase/migrations/20260214003229_…:62`) y los numeradores `next_invoice_number`, `next_credit_note_number`, `next_booking_number`, `next_delivery_number`, `next_inspection_number`, `next_quote_number` nunca reciben un `REVOKE` nominal, pero **fueron creados antes del barrido del 2026-05-27**, que sí les quitó `anon`; sus redefiniciones posteriores son `CREATE OR REPLACE`, que conserva ese ACL. No son riesgo de ACL.

### C-ter. Hallazgo distinto, no de permisos: numeración sin filtro de organización

Confirmado en `supabase/migrations/20260731191816_a7022d15-….sql:15,29,42,54`: `next_booking_number`, `next_delivery_number`, `next_credit_note_number`, `next_invoice_number` (y `next_inspection_number` en `…20260720011825_…:69`) calculan el folio con `nextval(secuencia global)` y un `MAX(...)` sobre **toda la tabla, sin predicado `organization_id`**. Contrasta con `next_organization_document_counter(text,bigint)` (`drizzle/migrations/0016_…:80`), que sí resuelve contexto de organización. Es un bloqueador de multiempresa independiente del hallazgo de `anon`: los folios se colisionarían entre empresas. No se propone corrección en este tramo; se registra para decidir orden con respecto a `0028`.

### D. Casos que requieren decisión (grant a anon intencional)

| Función | Grant | Archivo:línea |
|---|---|---|
| `get_public_branding()` | `TO anon, authenticated` (excluida de los barridos a propósito) | `drizzle/migrations/0019_…:26` |
| `today_mty()` | `TO authenticated, anon, service_role` | `supabase/migrations/20260731235443_…:9` |
| `fx_is_missing(text,numeric)` | `TO authenticated, anon, service_role` | `supabase/migrations/20260901080020_…:13` |

### E. Higiene de `search_path`

~40 definiciones usan `SET search_path = public AS $$` sin punto y coma intermedio (queda `public`, correcto) pero otras quedan con `public, storage` (`0021:4`, `0022:20/36/85`) o `public, auth` (`revoke_user_sessions`). Son intencionales por acceso a esos esquemas; conviene documentarlo en vez de cambiarlo.

## Alcance real de exposición (callers)

- No existe `src/routes/api/public/*`; todas las páginas cuelgan de `AuthGuard` (`src/layouts/AuthGuard.tsx:112-117`), y las server functions exigen `requireSupabaseAuth` antes de cualquier RPC.
- Las Edge Functions usan `service_role` salvo `stamp-*` y `_shared/repFolio.ts:104,124`, que reenvían el cliente del caller ya autenticado.
- Conclusión: la app no expone estas RPC sin sesión, pero **PostgREST sí**: con la publishable key y sin login, cualquiera puede llamar `/rest/v1/rpc/<nombre>` si el ACL lo permite. El riesgo es de superficie de API, no de la UI.

## Límites de cobertura (no inventar estado productivo)

- **No se leyó el ACL real de producción.** Todo lo anterior es inferencia del orden de migraciones; el estado efectivo de `proacl` en `zxefrzfaynnfwazqhwxp` no está verificado.
- El escaneo es regex sobre SQL: puede haber falsos positivos (funciones recreadas antes del barrido con otro nombre de archivo) y falsos negativos (revokes generados dinámicamente).
- `0024`–`0027` no están aplicados (journal en `0023`), así que sus firmas aún no existen en producción.
- No se ejecutó la revalidación en PostgreSQL efímero en este tramo (solo lectura); se propone como primer paso del siguiente.

## Próximos parches propuestos (forward-only, uno por vez)

1. **Detector antes que parche.** Nueva prueba `supabase/tests/rls/function_acl_contract.sql`: recorre `pg_proc` de `public` con `prosecdef`, y falla si existe fila `anon` en `aclexplode(proacl)` salvo una lista blanca explícita (`get_public_branding`, `today_mty`, `fx_is_missing`). Control positivo: la firma REP debe seguir sin `anon`. Esto convierte el hallazgo en regresión permanente.
2. **Migración `0028_function_acl_revoke_anon.sql`**: barrido nominal `REVOKE EXECUTE ... FROM anon, PUBLIC` sobre las firmas del grupo A y B, con `GRANT EXECUTE TO authenticated, service_role` solo donde el contrato actual ya lo concede (respetando `lock_invoice_for_rep` = solo `service_role`). Sin cambiar cuerpos, roles ni lógica.
3. **Utilería E2E** (`e2e_*`, `purge_e2e_data`, `next_*_e2e`): decisión pendiente del usuario — revocar a `authenticated` además de `anon`, o retirarlas de producción. No se decide aquí.
4. **Revalidación en PostgreSQL efímero**: reproducir default privileges + `CREATE FUNCTION` nueva vs `CREATE OR REPLACE` de una preexistente, como control del detector, antes de escribir `0028`.
5. Cada paso con su entrada de changelog y actualización de `docs/multiempresa/`; sin aplicar SQL a producción ni habilitar la segunda empresa.

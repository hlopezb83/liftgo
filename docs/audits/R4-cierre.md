# Reporte Final R4 — Cierre de auditoría

**Versión:** [`v7.150.0`](/changelog/v7.150.0.json) · **Fecha:** 21 / 07 / 2026 · **Rama base:** `main`

Cierre del ciclo de auditoría R4 (`liftgo-instrucciones-lovable-r4.md`) — 24 hallazgos organizados en 6 bloques. Este documento consolida los sprints v7.145.0 → v7.150.0 y presenta el checklist de verificación ejecutado en el commit de cierre.

---

## 1. Bloques ejecutados

| # | Bloque | Versión | Estado |
|---|---|---|---|
| 1 | Fechas / TZ (parseDateLocal, formatMtyDate) | `v7.145.0` | ✅ |
| 2 | Formularios & responsive (double-submit, portal overflow) | `v7.146.0` | ✅ |
| 3 | Portal cliente & CFDI (labels, taxes, transferencias) | `v7.147.0` | ✅ |
| 4 | Tablas / Gantt / FormDialog | `v7.148.0` | ✅ |
| 5 | Global Search, roles y sanitización | `v7.149.0` | ✅ |
| 6 | Endurecimiento de permisos, REP claim leak y limpieza | `v7.150.0` | ✅ |

---

## 2. Checklist de verificación (v7.150.0)

| Chequeo | Comando | Resultado |
|---|---|---|
| **Typecheck** | `bunx tsgo --noEmit` | ✅ 0 errores |
| **Knip** (dead code / unused deps) | `bunx knip --no-progress` | ✅ 0 findings |
| **Deno fmt** (Edge Functions) | `cd supabase/functions && deno fmt --check` | ✅ 85 archivos OK |
| **Vitest** (unit) | `bunx vitest run` | ✅ **1180 / 1180** (178 files) |
| **Version consistency** | `node scripts/check-version.mjs` | ✅ `version.json` = `changelog[0]` = `7.150.0` |
| **Edge Function deploy** | `supabase deploy stamp-payment-complement` | ✅ Deployed |
| **DB linter** (Supabase) | `supabase--linter` | ⚠️ 172 findings preexistentes, ninguno introducido por R4 (ver §4) |

---

## 3. Cambios de seguridad del Bloque 6

### 6.1 `billing_secrets` — column-level SELECT
- `REVOKE ALL` a `anon`; `REVOKE SELECT` a `authenticated`.
- `GRANT SELECT (id, created_at, updated_at)` a `authenticated`.
- Las llaves Facturapi (`facturapi_test_key`, `facturapi_live_key`) **ya no son legibles desde el cliente** — sólo desde Edge Functions con `service_role`.
- `useBillingSecrets.ts`: `.select("id, updated_at")` para no fallar tras el revoke.

### 6.2 `customer_payment_intents` — defensa en profundidad
- `REVOKE ALL` a `anon`. RLS y grants a `authenticated` / `service_role` intactos.

### 6.3 `stamp-payment-complement` — REP claim leak
- Antes: si `getFacturapiConfig()` devolvía `apiKey` vacío tras reservar el installment, la fila quedaba huérfana en `rep_cfdi_status='in_progress'`.
- Ahora: `releaseClaim("Facturapi key no configurada")` antes del `jsonError(400)`.

### 6.4 `GlobalSearch` — guards + tests
- Fallback `"—"` para `invoice_number` / `booking_number` / `name` nulos.
- Nuevo test `src/layouts/__tests__/globalSearchEntities.test.ts` (2 tests, incluye query < 2 chars).

### 6.5 Cleanup
- Eliminado `defaultValidUntil()` muerto y sus imports `addDays` / `nowMty` en `useQuotePrefill.ts`.
- Depurado `knip.json` (removidos `@sentry/react`, `@sentry/vite-plugin` — ya no son falsos positivos).

---

## 4. Notas sobre el DB linter (172 findings preexistentes)

Los 172 hallazgos del linter Supabase **no son introducidos por R4** — provienen de:

- **2 ERROR** — `Security Definer View` (vistas legacy).
- **~160 WARN** — `Public Can Execute SECURITY DEFINER Function` (RPCs de dominio; permisos gestionados en código vía `has_role`).
- **~10 WARN** — `Function Search Path Mutable` (funciones antiguas; las creadas por R4 usan `SET search_path = public`).
- **1 WARN** — `Extension in Public` (extensión histórica).

Se documentan para el próximo ciclo (**R5 — Hardening DB**), sin bloquear el cierre de R4.

---

## 5. Enlaces

- Changelog índice: [`public/changelog.json`](/changelog.json) → entrada 0 = `7.150.0`.
- Detalle: [`public/changelog/v7.150.0.json`](/changelog/v7.150.0.json).
- Memoria de seguridad: `mem://security-memory.md`.

---

**Cierre R4 aprobado.** 6 / 6 bloques completos · 0 errores en typecheck / knip / deno fmt · 1180 / 1180 tests verdes.

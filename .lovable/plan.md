# Lote 9 — DRY en Edge Functions

Cerrar el sprint DRY con el lado servidor. Hoy 15+ Edge Functions repiten la misma tríada `SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY` + construcción manual de `callerClient` + `adminClient`, y cada una reinventa `jsonError` / `jsonResponse` con headers CORS. `_shared/auth.ts` ya tiene parte del patrón (`requireAuth`, `requireRole`) pero no todas las funciones lo usan y no hay helpers para las funciones no-admin (recurring jobs, PDF, download-cfdi, validaciones).

## Objetivo

Extraer 3 helpers en `supabase/functions/_shared/` y migrar todas las funciones que hoy inicializan clientes o construyen respuestas a mano, sin cambiar comportamiento observable.

## Alcance

### A. Nuevos helpers en `_shared/`

1. **`_shared/supabaseClients.ts`**
   - `getAdminClient()` → `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` (sin auth persistente).
   - `getCallerClient(req)` → `createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })`.
   - `getSupabaseEnv()` → `{ url, anonKey, serviceKey }` para casos que aún necesitan los strings crudos.
   - Reutilizados por `requireAuth`/`requireRole` en `auth.ts` (elimina la duplicación interna).

2. **`_shared/http.ts`**
   - `jsonResponse(req, body, init?)` con CORS + `Content-Type: application/json`.
   - `jsonError(req, status, message, extra?)` (mueve el helper privado que hoy vive en `auth.ts`).
   - `withCors(req, handler)` wrapper que ejecuta `handleCors` y captura errores no controlados en un único `catch` con `jsonError(500, ...)`, eliminando el `try/catch` boilerplate repetido en cada `serve()`.

3. **Actualización de `_shared/auth.ts`**
   - Reescribir `requireAuth`/`requireRole` para usar los helpers nuevos.
   - Exportar `jsonError` desde `http.ts` (re-export en `auth.ts` para retro-compatibilidad).

### B. Migración de funciones (≥15 archivos)

| Función | Cambio |
|---|---|
| `generate-recurring-maintenance` | reemplazar `createClient` × 2 por `getAdminClient` + `getCallerClient` |
| `generate-recurring-invoices` | idem |
| `generate-invoice-pdf` | idem |
| `generate-manual` | idem |
| `download-cfdi` | idem |
| `validate-supplier-rep` | idem |
| `validate-receptor-tax-info` | idem |
| `stamp-cfdi` / `stamp-credit-note` / `stamp-payment-complement` | idem |
| `cancel-cfdi` / `cancel-credit-note` / `cancel-payment-complement` | idem |
| `refresh-cancellation-status` | idem |
| `classify-feedback-report` | idem |
| `parse-cfdi-expense` / `parse-csf` | migrar respuestas a `jsonResponse`/`jsonError` |
| `invite-user` / `invite-customer` / `delete-user` / `toggle-user-status` / `reset-user-password` | ya usan `requireAuth`; consolidar respuestas con `jsonResponse` |

### C. Reglas de migración

- **Cero cambios de contrato**: mismos status codes, mismos payloads, mismos headers (`Content-Type`, CORS).
- **No tocar** la lógica de negocio (Facturapi, generación de PDF, RPCs). Solo se sustituyen las 2-4 líneas de bootstrapping y las respuestas.
- **`handleCors`** sigue igual (ya centralizado); solo se agrega el wrapper opcional `withCors` para funciones nuevas — la migración masiva a `withCors` queda **fuera de alcance** para no reindentar los `serve()`.
- Preservar los `getClaims` explícitos en `stamp-*` / `cancel-*` (no todos usan `requireAuth` porque tienen validación de rol propia).

## Fuera de alcance

- Refactor de la lógica CFDI (Facturapi wrappers) — se hará en un lote separado.
- Migración de tests (`_test.ts`) — se validan sin cambios; si algún mock queda obsoleto se ajusta como excepción.
- Cambiar `handleCors` o el allowlist de orígenes.
- `parse-cfdi-expense` XML parsing.

## Verificación

- `tsgo` limpio en front (los tipos de Edge Functions se validan con `deno check` en CI si aplica; localmente `bunx vitest run` cubre el front).
- `bunx vitest run` verde (≥137 tests actuales, sin regresiones).
- `bunx knip --include files,dependencies,binaries` limpio.
- Smoke manual de 3 funciones críticas vía UI: generar recurring invoice, timbrar un CFDI de prueba, invitar un usuario.

## Entregables

- 2 archivos nuevos en `supabase/functions/_shared/` (`supabaseClients.ts`, `http.ts`).
- 1 archivo modificado en `_shared/` (`auth.ts` consolidado).
- ~15-18 `index.ts` de Edge Functions migrados.
- Entrada `v6.140.0` (minor) en `public/changelog.json` + `public/changelog/v6.140.0.json`.

## Estimación de impacto

- ~120–160 LOC de boilerplate eliminadas en Edge Functions.
- Un solo lugar para actualizar el bootstrapping si cambian nombres de env vars o versión de `@supabase/supabase-js`.
- Respuestas JSON con headers consistentes (elimina bugs sutiles de CORS por headers mal fusionados).

## Orden de ejecución

1. Crear `_shared/supabaseClients.ts` + `_shared/http.ts`.
2. Refactor interno de `_shared/auth.ts`.
3. Migrar funciones de CFDI (stamp/cancel/download/refresh) — grupo homogéneo, mayor volumen.
4. Migrar recurring jobs + generate-* (invoices, maintenance, invoice-pdf, manual).
5. Migrar validate-* y parse-*.
6. Migrar admin (invite/delete/toggle/reset) — solo consolidación de respuestas.
7. Typecheck + tests + Knip.
8. Changelog `v6.140.0`.

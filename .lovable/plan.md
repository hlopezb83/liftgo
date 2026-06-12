# Lote 2 — Parte 6: Mock de Facturapi y tests reales para `stamp-cfdi`

## Contexto

Pendientes del Lote 2 después de v6.43.5:

1. Mock server de Facturapi para fiscales.
2. Seed E2E para portal/damage/maintenance/returns.
3. Subir umbrales de cobertura (ya en 10/10/9/7, siguiente meta 15%).

De los tres, el de mayor ROI es el **mock de Facturapi**: hoy `stamp-cfdi/index_test.ts` solo cubre CORS + 401 sin Authorization. Toda la lógica de timbrado (validación de invoice, llamada al PAC, persistencia de UUID, manejo de errores Facturapi) está sin red de seguridad. Un cambio en el payload del PAC o en el flujo de update rompe en producción sin que ningún test reaccione.

El seed E2E es más caro (necesita datos sembrados en una DB real / staging) y bloqueará la sesión; lo dejo para un lote dedicado.

## Objetivo

Sustituir el smoke test de `stamp-cfdi` por una suite que ejercite el flujo completo del Edge Function usando:

- Un **mock HTTP de Facturapi** (intercept de `fetch` a `https://www.facturapi.io/v2/*`) configurable por test: respuesta exitosa, error 400 (datos inválidos), error 5xx (PAC caído), timeout.
- Un **mock de `createClient` de Supabase** ya disponible en el repo (mismo patrón que los otros tests Deno), parametrizable para devolver una invoice válida, una `not found`, una con `is_e2e=true`, y user sin rol admin/administrativo.

## Alcance

### 1. `supabase/functions/_shared/test/facturapiMock.ts` (nuevo)

Helper reutilizable. Exporta:

- `installFacturapiMock(handlers: Record<string, (req: Request) => Response | Promise<Response>>)`: parchea `globalThis.fetch` solo para URLs que empiecen con `https://www.facturapi.io/v2/`. Resto pasa al `fetch` original.
- `restoreFetch()`: revierte el parche en `afterEach`.
- Respuestas pre-armadas: `facturapiOk(uuid)`, `facturapiBadRequest(message)`, `facturapiServerError()`.

### 2. `supabase/functions/_shared/test/supabaseClientMock.ts` (nuevo)

Helper que parchea el módulo `https://esm.sh/@supabase/supabase-js@2` con `createClient` que retorna chains configurables (similar a `createSupabaseChainMock` del frontend, pero para Deno). Permite stubbear:

- `auth.getClaims(token)` → `{ data: { claims: { sub } } }` o error.
- `from('user_roles').select().eq()` → roles del usuario.
- `from('invoices').select().eq().single()` → invoice o not found.
- `from('invoices').update().eq()` → ok / error de RLS.

Si reutilizar `createSupabaseChainMock` cruzando frontend/Deno es viable lo intentamos primero; si no, helper Deno-only.

### 3. `supabase/functions/stamp-cfdi/index_test.ts` (reescritura)

Mantiene los 2 casos actuales (CORS, 401 sin Authorization) y añade:

- **403** cuando el usuario no es admin/administrativo.
- **400** cuando `invoice_id` no es UUID.
- **404** cuando la invoice no existe.
- **400** cuando `is_e2e === true` (no debe llegar al PAC).
- **Happy path**: invoice válida + rol admin + Facturapi 200 → response 200 con UUID, y el mock de Supabase recibió un `update` con el UUID y `status='stamped'` (o equivalente al campo real).
- **502/PAC error**: Facturapi responde 400 → el endpoint propaga error legible, NO marca la invoice como timbrada.

### 4. `supabase/functions/stamp-cfdi/deno.json` o import map (si hace falta)

Algunos test runners de Deno necesitan import map para parchear módulos `https://esm.sh/...`. Si el approach de parchear `createClient` por intercept de import no es directo, alternativa: refactorizar `index.ts` para inyectar el cliente vía argumento (`stampInvoice(req, deps)`), exportar la función pura, y testear sobre la función pura. Esta segunda vía es más limpia y la prefiero si el primer intento se complica.

### 5. Changelog

`public/changelog.json` + `public/changelog/v6.43.6.json` documentando el mock helper y los nuevos casos cubiertos.

## Fuera de alcance

- Seed E2E para portal/damage/maintenance/returns (lote propio).
- Replicar el mock para `stamp-credit-note`, `cancel-payment-complement`, `parse-cfdi-expense`, `generate-recurring-invoices` — primero validamos el patrón con `stamp-cfdi`, después se replica en lote 3.
- Subir umbrales de cobertura (estos tests son Deno, no entran al `vitest --coverage`).

## Riesgos

- **Parcheo de `fetch` global en Deno**: si Facturapi se llama vía un cliente que no usa `globalThis.fetch` (poco probable, pero a verificar leyendo `index.ts`), el mock no intercepta. Mitigación: el refactor a función pura con deps inyectadas.
- **Mock de `createClient` cross-runtime**: el helper del frontend usa Vitest `vi.mock`; en Deno hay que usar `Deno.test` con import map o refactor. El fallback a función pura es el plan B.

## Validación

- `deno test supabase/functions/stamp-cfdi/` debe pasar todos los casos nuevos.
- `bunx vitest run` debe seguir en 503/503 verde (sin tocar frontend).

## Pregunta abierta

¿Procedo con esta Parte 6 (mock Facturapi + stamp-cfdi), o prefieres saltar al seed E2E aunque sea más costoso? El seed E2E requiere decidir antes si lo corremos contra la DB de preview o si montamos staging dedicado.

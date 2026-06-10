# Plan — Retomar Auditoría de Tests · Lote 11 (RLS sin red)

## Contexto

De los 12 lotes de la auditoría (3076 mensajes atrás), están cerrados los lotes **1–9 y 12** (≈93 tests nuevos vitest + Deno + 31 rutas smoke). Quedan dos pendientes:

- **Lote 10 — E2E happy paths (Playwright)**: ya con el secret admin configurado, sigue requiriendo un helper de seed por RPC para datos reproducibles. **Fuera de scope de este plan** (se retoma después).
- **Lote 11 — RLS / policies**: ahora lo cerramos como **suite Vitest con mocks de Supabase**, sin necesidad de usuarios reales en BD.

## Por qué unit tests y no integration

Las RLS reales se prueban en BD; aquí validamos el **contrato cliente↔RLS**: que cada hook construya el query correcto, maneje los `permission denied` y arreglos vacíos como "no acceso", y respete los roles definidos en `useRolePermissions`. Esto complementa (no reemplaza) los tests de integración futuros con `pg_tap` o usuarios sembrados.

## Cobertura propuesta (10 tests, 1 archivo por dominio)

| # | Archivo | Caso | Verifica |
|---|---|---|---|
| 1 | `useSupplierBankAccounts.rls.test.ts` | customer/ventas/dispatcher reciben `permission denied` | hook propaga error vía `notifyError`, query no rompe UI |
| 2 | `useSupplierContacts.rls.test.ts` | customer recibe `permission denied`; staff lee normal | mismo patrón que arriba |
| 3 | `useForklifts.rls.test.ts` | customer recibe `[]` y `useCustomerForklifts` (RPC brief) entrega solo id/nombre/modelo/fabricante | que el portal use la RPC, no la tabla |
| 4 | `useInvoicesRLS.test.ts` | mecánico recibe `[]` en lista de facturas; admin recibe filas | hook trata `[]` como "sin acceso" sin loop infinito |
| 5 | `useBookingsRLS.test.ts` | mecánico no lee `bookings`; customer solo ve las suyas (mock filtrado por `customer_id`) | filtros correctos antes del query |
| 6 | `useDocumentsRLS.test.ts` | mecánico solo ve docs `forklift`/`maintenance`; customer signed URL falla si doc no le pertenece | `useDocuments` lanza error claro |
| 7 | `useCollectionRemindersLog.rls.test.ts` | auditor lee; dispatcher recibe denied | nuevo policy v5.81.3 |
| 8 | `useCompanySettings.rls.test.ts` | mecánico recibe denied; público lee solo branding vía RPC `get_public_branding` | post-hardening v5.81.4 |
| 9 | `useBillingSecretsStatus.test.ts` | hook nunca pide columnas crudas; solo flags vía RPC `get_billing_secrets_status` | confirma postura aceptada |
| 10 | `roleMatrix.test.ts` | `getAccessLevel` retorna el nivel correcto para los 28 módulos × 7 roles según seeds de `role_permissions` | regresión de la reorganización v6.37.0 |

Todos los archivos viven junto a la unidad bajo prueba (`src/features/.../__tests__/`) excepto `roleMatrix.test.ts` que va en `src/test/`.

## Patrón técnico (igual al `rolePermissions.test.ts` existente)

```text
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => mock() }) }) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "uid", role: "customer" } }) }));
```

- `mock()` devuelve `{ data: null, error: { code: "42501", message: "permission denied for table X" } }` para simular rechazo RLS, y `{ data: [...], error: null }` para acceso permitido.
- Se renderiza el hook con `QueryClientProvider` (retry: false), se espera `isFetching=false`, y se asserta `data`/`error`.
- Para RPCs (`get_public_branding`, `get_billing_secrets_status`, `get_customer_forklifts_brief`) se mockea `supabase.rpc("name")`.

## Cambios fuera de tests

Ninguno previsto. Si algún test descubre un bug real (p. ej. hook sin manejo de `error`), se documenta y se aborda como follow-up separado — **este lote es solo cobertura**.

## Entregables

1. 10 archivos `*.rls.test.ts` (+`roleMatrix.test.ts`) — ~40–50 casos totales.
2. Entrada `public/changelog.json` + `public/changelog/v6.37.2.json` documentando "Lote 11 — RLS coverage (unit, sin red)".
3. Suite verde (`bunx vitest run`) y resumen por archivo en la respuesta final.

## Fuera de scope

- Lote 10 (Playwright happy paths) — se retoma después con helper de seed por RPC.
- Tests de integración reales contra Postgres (pgTAP / usuarios sembrados) — propuesta separada.
- Refactor de hooks descubiertos como buggy durante la suite.
- Cambios en RLS o migraciones.

¿Apruebas y arranco?

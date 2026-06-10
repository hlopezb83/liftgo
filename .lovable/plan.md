# Plan — Lote 10 · E2E happy paths (Playwright)

## Contexto

Con el secret `E2E_TEST_EMAIL` ya apuntando a un usuario admin, el bloqueo restante es disponer de datos reproducibles por corrida. Resolvemos con un **helper de seed por RPC** que crea y limpia datos efímeros marcados `is_e2e = true`, y luego cubrimos los 5 happy paths que faltan.

## Entregables

### 1. RPCs de seed/teardown (migración)

Una sola migración que añade:

- Columna `is_e2e BOOLEAN NOT NULL DEFAULT false` en: `customers`, `forklifts`, `quotes`, `bookings`, `invoices`, `payments`, `equipment_models`.
- RPC `e2e_seed_scenario()` → admin-only (`has_role(auth.uid(),'admin')`). Crea: 1 modelo, 1 montacargas disponible, 1 cliente, 1 cotización en estado `accepted` lista para convertir, 1 booking confirmado, 1 factura `issued` con saldo pendiente. Devuelve JSON con todos los ids.
- RPC `e2e_teardown()` → admin-only. Borra en orden (payments → invoices → bookings → quotes → forklifts → equipment_models → customers) solo filas con `is_e2e = true`.
- Ambas con `SECURITY DEFINER`, `SET search_path = public`, fallan si caller no es admin.

### 2. Fixture Playwright `tests/e2e/fixtures/seed.ts`

- `seedScenario(page)`: llama `supabase.rpc('e2e_seed_scenario')` con el token de la sesión persistida y devuelve los ids.
- `teardownScenario(page)`: llama `e2e_teardown` en `afterEach`.
- Se integra como fixture extendido de Playwright (`test.extend`).

### 3. 5 specs nuevos (happy paths)

| Spec | Flujo |
|---|---|
| `quote-to-booking.spec.ts` | Abrir cotización seed → "Convertir a reserva" → asignar montacargas → confirmar → verificar `RSV-XXXX` en lista |
| `booking-to-invoice.spec.ts` | Abrir booking seed → "Generar factura" → verificar borrador en `/invoices` |
| `invoice-payment.spec.ts` | Abrir factura seed → "Registrar pago" → monto total → verificar status `paid` y aparición en `/payments` |
| `quote-pdf.spec.ts` | Abrir cotización seed → "Descargar PDF" → verificar `download` event con nombre `COT-*.pdf` |
| `customer-create.spec.ts` | `/customers/new` → llenar RFC genérico → guardar → verificar redirect a detalle |

Cada spec usa el fixture seed + teardown, evita acoplarse a IDs existentes, y agrega `data-testid` mínimos solo donde sea estrictamente necesario (el resto via roles/labels accesibles).

### 4. Documentación

- `docs/e2e-roadmap.md`: marcar Lote 10 como completado, documentar el patrón seed/teardown.
- `public/changelog.json` + `public/changelog/v6.37.3.json`: "Lote 10 — E2E happy paths con RPC de seed".

## Detalles técnicos

- Las RPCs son las únicas en escribir `is_e2e=true`; la app normal nunca toca esa columna → cero riesgo de borrar datos reales.
- El teardown corre en `afterEach`, no en `afterAll`, para aislamiento por test.
- Específicamente para `payments` y `bookings` se respeta el orden de FKs.
- `quote-pdf.spec.ts` usa `page.waitForEvent('download')` — no parsea el PDF.
- No tocamos `playwright.config.ts` (ya soporta el flow).
- Los specs placeholder actuales (`booking.spec.ts`, `quote-to-invoice.spec.ts`) se eliminan al estar reemplazados por los nuevos.

## Fuera de scope

- pgTAP / tests RLS reales contra Postgres (propuesta separada).
- Refactor de componentes para añadir `data-testid` masivos — solo los mínimos imprescindibles.
- Specs para módulos fuera del happy path (CRM, mantenimiento, retornos, contratos).

¿Apruebas y arranco?

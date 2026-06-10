## Hallazgos de los reportes E2E

Shard 2: ✅ 20/20 pasaron.  
Shard 1: ❌ 2 fallos reales (no flakes, no problema de sharding).

### Fallo 1 — `customer-create.spec.ts`
La prueba navega a `/customers/new`, pero **esa ruta no existe**. `routes-config.tsx` solo registra `/customers/:id`, así que React Router interpreta `"new"` como UUID y la página dispara dos toasts `Error: query — invalid input syntax for type uuid: "new"`. El input `getByLabel(/nombre/i)` nunca aparece y la prueba expira a los 60s.

En la app real, crear cliente se hace desde `/customers` abriendo `CustomerFormDialog` con el botón "Nuevo cliente".

### Fallo 2 — `booking-to-invoice.spec.ts > invoice detail renders booking number link`
La prueba espera ver `seed.booking_number` (p.ej. `RSV-0018`) en la página de detalle de factura. Pero `InvoiceSourceLinks.tsx` **no renderiza el número de reserva**: en la sección "Generada desde reserva" muestra `sourceBooking.forklifts?.name` como label del badge y el link apunta a `/bookings` (no a la reserva). El texto `RSV-XXXX` nunca está en el DOM del detalle de factura.

Ambos fallos son aserciones que ya estaban desalineadas con la UI actual; quedaron expuestos al correr en shard 1 con seeds nuevos. No tienen que ver con el sharding ni con el aislamiento por `e2e_scope`.

---

## Plan de corrección (solo tests, sin tocar la app)

### 1. Reescribir `tests/e2e/customer-create.spec.ts`
Flujo real desde la UI:
1. `page.goto("/customers")`.
2. Click en el botón "Nuevo cliente" (texto exacto del header de `CustomersPage`).
3. Esperar a que el `CustomerFormDialog` abra (rol `dialog`).
4. Llenar nombre, RFC `XAXX010101000` y email dentro del dialog (scoping con `page.getByRole("dialog")`).
5. Click "Guardar".
6. Verificar que el nombre aparezca en la tabla/lista de clientes.

Mantener `test.setTimeout(60_000)`, prefijo `E2E UI ${Date.now()}` y sin uso del fixture `seed` (la prueba crea su propio cliente y depende del `e2e_teardown` por nombre/prefijo — verificar que el RPC borre por patrón o agregar `is_e2e=true` si la UI lo soporta; si no, dejar comentario TODO).

### 2. Ajustar `tests/e2e/booking-to-invoice.spec.ts > "invoice detail renders booking number link"`
Reemplazar la aserción sobre `seed.booking_number` por aserciones reales que sí existen en el DOM:
- `seed.invoice_number` visible.
- Texto "Generada desde reserva:" visible (confirma que se renderizó `InvoiceSourceLinks` con `sourceBooking`).
- Un link cuyo `href="/bookings"` esté presente (`page.getByRole("link").filter({ has: page.getByText("/...") })` o `page.locator('a[href="/bookings"]')`).

Renombrar opcionalmente el test a `"invoice detail shows source booking link"` para reflejar la aserción real.

### 3. Verificación
- Correr localmente `bunx playwright test customer-create.spec.ts booking-to-invoice.spec.ts --workers=2` (con credenciales `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`).
- Si pasa, añadir entrada de changelog **v6.41.1 (patch)** describiendo los dos arreglos de E2E.

### Notas
- No se toca código de producto: ambas pruebas estaban verificando comportamientos que la UI nunca tuvo (ruta inexistente y texto no renderizado).
- No se modifica el RPC `e2e_seed_scenario`/`e2e_teardown` ni `playwright.config.ts`. El sharding y paralelización quedan como están.
- Si el equipo prefiere que el detalle de factura sí muestre el `booking_number` (como liga a la reserva), eso sería un cambio de UI separado — avísame y abro otro plan para `InvoiceSourceLinks`.

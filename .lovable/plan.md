
## Objetivo

En **facturas de venta (FAC-)**, cuando la partida provenga de un equipo asignado (reserva o venta), incluir el número de serie del montacargas al final de la descripción entre paréntesis. Solo aplica a partidas **nuevas**; borradores existentes no se tocan.

## Formato

- Con serie: `"MC-01 — Renta mensual (Serie: 12345)"`
- Sin serie registrada: se omite el sufijo (queda igual que hoy).
- Venta de equipo (ya existe línea propia): se conserva el `S/N: XXX` actual pero se normaliza al mismo formato `(Serie: XXX)`.

## Cambios

### 1. `src/lib/domain/rentalCalculation.ts`
- `generateLineItems(forklift, start, end)`: al mapear, si `forklift.serial_number` existe, anexar `` ` (Serie: ${forklift.serial_number})` `` al final de `description`.
- `generateLineItemsFromModel(...)`: sin cambios (no hay equipo asignado, solo modelo).

### 2. `src/features/invoices/hooks/invoiceForm/invoiceFormBuilders.ts`
- Línea de venta de equipo (`enriched.description`): reformatear a `` `${manufacturer} ${model} — Venta de equipo (Serie: ${serial_number || "N/A"})` ``.

### 3. `supabase/functions/generate-recurring-invoices/index.ts`
- Ampliar `select` de bookings a `forklifts(name, monthly_rate, serial_number)`.
- Agregar `forkliftSerial: string | null` a `PlanItem` (y al tipo `Forklift` local).
- En el mapeo de `lineItems`, si hay serial, anexar `` ` (Serie: ${i.forkliftSerial})` `` a la descripción.
- Redeploy de la edge function.

### 4. Tests
- Actualizar snapshots/expects en:
  - `src/lib/domain/__tests__/rentalCalculation.test.ts` (los casos que arman forklift ya incluyen `serial_number`).
  - `src/lib/domain/__tests__/invoiceHelpers.test.ts` si aplica.
- Agregar un caso: forklift sin `serial_number` → descripción sin sufijo.

### 5. Changelog
- Nueva entrada **patch** `v6.107.1` en `public/changelog.json` + `public/changelog/v6.107.1.json`:
  - Título: "Serie del equipo en partidas de facturas"
  - Descripción: las facturas de venta ahora incluyen el número de serie del montacargas en la descripción de la partida, tanto en facturas manuales como recurrentes.

## Fuera de alcance

- Cotizaciones, notas de crédito, facturas de proveedor, contratos.
- Retroactivo: borradores existentes conservan su descripción actual salvo que el usuario regenere las partidas seleccionando la reserva de nuevo.

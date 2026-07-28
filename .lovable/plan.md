## Objetivo

Que al hacer clic en una fila de los reportes **Antigüedad de Cartera**, **Utilización de Flota** e **Ingresos** se pueda ver el detalle que compone ese total, siguiendo el patrón de panel lateral (drill-down) que ya usa el resto del ERP (Daños, Refacciones, Mantenimiento, Flujo de Efectivo).

## Comportamiento propuesto

**1. Antigüedad de Cartera (Aging)**
- Cada fila ya es una factura individual: clic en la fila navega directo a `/invoices/:id`.
- Además, las 4 tarjetas de bucket (0-30, 31-60, 61-90, 90+) se vuelven clicables y filtran la tabla de abajo a ese bucket, con un chip "Mostrando 31-60 días · Quitar filtro".

**2. Utilización de Flota**
- Cada fila es un montacargas. Clic abre un panel lateral con:
  - Resumen: días reservados / días del rango / % utilización.
  - Lista de reservas que se traslapan con el rango (folio, cliente, fechas recortadas al rango, días contados en el cálculo, estatus).
  - Clic en una reserva navega a `/bookings/:id`.
- Se muestra una nota cuando hay traslape entre reservas (los días se cuentan una sola vez), para que la suma del panel cuadre con el total.

**3. Ingresos (Revenue)**
- Cada fila es un mes. Clic abre un panel lateral con:
  - Resumen del mes: facturado, pagado, número de facturas.
  - Lista de las facturas de ese mes (folio, cliente, fecha, moneda original, total en MXN, estatus), ordenada por monto descendente.
  - Clic en una factura navega a `/invoices/:id`.
  - Botón "Exportar CSV" del detalle del mes.

En los tres casos: filas con cursor pointer, foco por teclado y `Enter` para abrir (ya soportado por `DataTableV2` vía `onRowClick`).

## Detalles técnicos

- `DataTableV2` ya expone `onRowClick`; no requiere cambios en el data table.
- Nuevos componentes en `src/features/reports/components/reports/drilldown/`:
  - `UtilizationDetailSheet.tsx`
  - `RevenueMonthDetailSheet.tsx`
  - `AgingBucketFilterChips.tsx` (tarjetas clicables + chip de filtro)
- Nuevo helper `src/features/reports/lib/drilldown.ts` con las funciones puras de composición (`bookingsForForkliftInRange`, `invoicesForMonth`, recorte de fechas al rango) para poder testearlas sin render.
- Los paneles reutilizan datos ya cargados en cada reporte (`useInvoices`, `useBookings`, `useForklifts`); **no se agregan consultas nuevas** ni cambios de base de datos.
- Para mostrar cliente/folio en el panel de Utilización se usan los campos que ya trae `useBookings`; si falta el nombre del cliente en el listado, se muestra el folio y se deja "—".
- Estructura: cada archivo ≤150 LOC, lógica en helpers, textos en español mexicano, moneda con `formatCurrency`, fechas con `formatDateDisplay`.
- Tests unitarios (Vitest) para los helpers de `drilldown.ts`: recorte al rango, exclusión de canceladas, agrupación mensual y normalización a MXN.
- Como último paso: nueva entrada en `public/changelog.json` + `public/changelog/v7.252.0.json` (minor).

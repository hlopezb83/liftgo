## Auditoría v7.88.1 (Sprint 2 parte 2)

**Tests:** 1034/1034 Vitest + 4/4 Deno para `computeProrate` en verde.

**Revisión de código:**
- `computeProrate` extraído como helper puro y cubierto con 4 tests (día 1, día 15, último día, febrero 28). Ok.
- `generate-recurring-invoices/index.ts:170-202`: primera factura arranca en `start_date` real (día ≠ 1) y calcula `billedAmount` correctamente. `subtotal`, `taxAmount` y `lineItems` ya usan `billedAmount` en vez de `monthlyRate`. Ok.
- Diálogo de preview y total muestran el importe prorrateado con etiqueta ámbar. Ok.
- Sobrecarga obsoleta de `complete_return_inspection` (8 args) eliminada; único callsite ya usa la firma canónica (9 args). Ok.
- Migración se aplicó limpio (los WARN del linter son preexistentes, no relacionados con esta ronda).

**Observación menor (no bloqueante):** cuando `executePlan` agrupa varias reservas del mismo cliente en una sola factura, usa `first.startStr`/`first.endStr` como `billing_period_start/end`. En la práctica el grouping siempre comparte periodo (misma mensualidad calendario), pero si algún día se permitiera mezclar líneas prorrateadas con no-prorrateadas dentro del mismo grupo, el periodo mostrado en la factura tomaría la del primer elemento. No es un bug hoy; se cubrirá cuando se refactor izquierda del preview multi-cliente. **No lo tocamos en este sprint.**

**Conclusión:** Sprint 2 (parte 2) cerrado sin deuda técnica. Procedo con Sprint 3.

---

## Sprint 3 — v7.89.0 (BL-17, BL-18, BL-19)

Los tres hallazgos pendientes atacan integridad operativa (disponibilidad de flotilla) y precisión del reporte financiero estrella (Estado de Resultados).

### BL-17 — Reservas `completed` siguen bloqueando el equipo

**Problema:** La constraint `no_overlapping_bookings` (GiST exclusion) sólo excluye `status != 'cancelled'`. Una reserva marcada `completed` (equipo devuelto) sigue reservando fechas en el rango original: si el cliente devuelve 10 días antes de `end_date`, esos 10 días están bloqueados para cualquier otra renta. Además el `daterange` es `'[]'` inclusivo: renta A hasta el 15 y renta B desde el 15 chocan, forzando un día de patio entre rentas.

**Fix:**
1. Migración que redefine el GiST: `WHERE (status NOT IN ('cancelled', 'completed'))`. La reserva completada ya cumplió su ciclo, no debe reservar calendario.
2. Cambiar el rango de `daterange(start_date, end_date, '[]')` a `daterange(start_date, end_date, '[)')` para permitir rotación mismo día (entrega en la mañana, entrega otra reserva en la tarde).
3. Antes de aplicar, ejecutar query de auditoría para detectar reservas activas que hoy se solapan por el borde inclusivo y flaggearlas.

### BL-18 — Depreciación por mes-frontera cobra doble

**Problema:** En `get_income_statement`, `rented_per_month` marca un mes con cualquier solape de 1 día y carga `acquisition_cost / 48` completo. Renta 31-mar → 2-abr genera 2 meses de depreciación por 3 días de renta. Distorsiona costo unitario en meses frontera e infla `months_rented` en el COGS de venta.

**Fix:** prorratear por días rentados dentro del mes: `depreciation_share = (acquisition_cost/48) × diasRentadosEnMes / diasDelMes`. Aplicar mismo criterio al `months_rented` que alimenta el valor en libros al vender.

### BL-19 — Base de efectivo asimétrica

**Problema:** En `get_income_statement`, `p_basis = 'cash'` filtra facturas por `paid_at` pero gastos de proveedor, mantenimiento y daños siguen usando fecha de emisión/devengo. Un P&L "cash" mezcla ingresos cobrados con gastos devengados — no es ni cash ni accrual.

**Fix:** cuando `p_basis = 'cash'`:
- `supplier_bills` → filtrar por `paid_at` (o suma de `supplier_payments.paid_at`).
- `maintenance_logs` → filtrar por fecha de pago si existe, si no por `completed_at`.
- `operating_expenses` → filtrar por `paid_at` cuando esté disponible; si no, dejar `date` (documentar el fallback).

### Cobertura de tests

- **BL-17:** test SQL que inserta reserva `completed` y verifica que otra reserva puede solapar (`bookings.spec.ts` en `tests/e2e` o test de RPC). Test unitario en TS que verifique el borde `[)` con reserva mismo día.
- **BL-18:** extraer helper `prorateDepreciation(acqCost, rentedDays, daysInMonth)` puro en `src/lib/finance/depreciation.ts` con 4 tests: mes completo, 1 día del mes frontera, mes con 28 días, `acqCost = 0`.
- **BL-19:** test de `get_income_statement` con `p_basis='cash'`: crear factura pagada + gasto pagado en meses distintos, verificar que ambos aparecen en el mes de pago.

### Riesgos

- **BL-17** cambia el comportamiento del calendario: reservas actualmente marcadas `completed` liberarán sus fechas. Verificar antes que no haya código dependiente de que `completed` siga ocupando el rango.
- **BL-18** reduce el costo mensual reportado en meses frontera → el resultado neto sube ligeramente en dichos meses. Documentar en changelog.
- **BL-19** puede alterar meses históricos si el usuario tiene reportes "cash" archivados. Documentar; el reporte se regenera on-demand así que no hay migración de datos.

### Archivos a modificar

- Nueva migración: redefinir GiST `no_overlapping_bookings` (BL-17).
- Nueva migración: reescribir `get_income_statement` con prorrateo de depreciación (BL-18) y filtros por fecha de pago para gastos (BL-19).
- Nuevo `src/lib/finance/depreciation.ts` + tests.
- `public/changelog.json` + `public/changelog/v7.89.0.json` (minor: cambio de comportamiento de reportes).

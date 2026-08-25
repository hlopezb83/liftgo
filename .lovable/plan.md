# H-6 — Exigir periodo en toda factura con reserva (Opción B)

## Resumen

El candado que propone H-6 (índice único "una factura manual por reserva") es incorrecto: bloquearía la facturación mensual legítima. El candado correcto ya existe (`uniq_invoices_recurring_period`), pero no cubre las facturas manuales porque dejan `billing_period_start` vacío. La solución es **etiquetar toda factura con reserva con su mes** y exigirlo de ahí en adelante, reutilizando el índice existente.

Analogía: en vez de un torniquete "una factura por contrato", le ponemos etiqueta de mes a cada factura y reusamos el detector de "dos facturas del mismo mes" que ya funciona.

## Estado actual verificado (consultas a la base real)

- **13 reservas** con más de una factura activa sin `billing_period_start`.
- **Duplicados reales** (mismo día + mismo importe, todos `cfdi_status = pending`, sin REPs vigentes):

| Reserva | Fecha | Importe | Facturas | Pagos | Acción |
|---------|-------|---------|----------|-------|--------|
| RSV-0003 | 2026-02-10 | $23,200 | FAC-0005, 0007, 0009 (3) | 3 pagos = $69,600 | conservar 1, cancelar 2 facturas + reversar 2 pagos |
| RSV-0004 | 2026-02-10 | $32,480 | FAC-0004, 0006, 0008 (3) | 3 pagos = $97,440 | conservar 1, cancelar 2 + reversar 2 pagos |
| RSV-0006 | 2026-02-10 | $23,200 | FAC-0014, 0015 (2) | 0 | conservar 1, cancelar 1 |
| RSV-0006 | 2026-04-06 | $23,200 | FAC-0032, 0052 (2) | 2 pagos = $46,400 | conservar 1, cancelar 1 + reversar 1 pago |
| RSV-0009 | 2026-02-11 | $22,040 | FAC-0022, 0023 (2) | 0 | conservar 1, cancelar 1 |

Totales: **7 facturas a cancelar** y **5 pagos a reversar**. Ninguna está timbrada → **no se cancela nada en el SAT**.

- El resto de las facturas múltiples por reserva son **mensualidades legítimas** (fechas distintas) que solo necesitan etiqueta de periodo.

## Fases

### Fase 1 — Limpiar duplicados reales (datos)
Por cada grupo de la tabla de arriba, finanzas elige qué factura conservar (criterio: la que tenga el pago en limpio). Para cada duplicada a cancelar:
1. Si tiene pagos: reversarlos (marcarlos eliminados/reversados según el flujo de `payments` — confirmar el campo de reversión en Fase 1; no hay REPs que cancelar).
2. Marcar la factura `status = 'cancelled'`.

Herramienta: `run_sql` (es cambio de datos, no de estructura). Se hace en una transacción por reserva para no dejar huérfanos.

> Nota: el movimiento de pagos requiere revisar el esquema de `payments` (campo de estado/anulación). Se documenta en Fase 1 antes de ejecutar.

### Fase 2 — Backfill de periodos (datos)
Para todas las facturas activas con `booking_id NOT NULL` y `billing_period_start IS NULL`:
- Inferir `billing_period_start` = primer día del mes de `issued_at`, `billing_period_end` = último día del mes.
- Heurística documentada; finanzas valida el resultado.

**Candado previo (crítico):** antes de hacer el `UPDATE`, correr una query de verificación que confirme que, tras la inferencia, **no quedan pares (booking_id, mes) duplicados**. Si quedaran (p. ej. una extensión facturada el mismo mes que la mensualidad), se resuelven a mano en esa misma fase. Solo cuando la verificación pasa, se ejecuta el backfill.

Herramienta: `run_sql`.

### Fase 3 — Migración de estructura
1. **No crear** el índice `invoices_booking_manual_uniq` de H-6 (no aplica).
2. Agregar `CHECK (booking_id IS NULL OR billing_period_start IS NOT NULL)` a `public.invoices`. Es una regla estructural estática (no dependiente del tiempo), así que `CHECK` es válido según las reglas del proyecto.
3. Confirmar que el índice `uniq_invoices_recurring_period` existente sigue cubriendo los duplicados por periodo.

Herramienta: `migration`.

### Fase 4 — UI: exigir periodo al facturar una reserva
- `src/features/invoices/lib/invoiceFormSchema.ts`: hacer `billing_period_start` requerido en el schema de Zod **cuando hay `booking_id`/`bookingIds`** (condicional).
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts` (`buildPayload`): incluir `billing_period_start` y `billing_period_end` en el payload enviado a la base (hoy no se envían).
- `src/features/invoices/pages/InvoiceForm.tsx`: agregar selector de periodo (sugerencia: reusar `DatePickerMx` o un mes-año) visible cuando se selecciona reserva; pre-llenar con el mes de la fecha de emisión.
- Auditar las demás rutas de creación de factura para que respeten la regla:
  - `create_recurring_invoice` (RPC): ya envía periodo. ✔
  - "Facturar extensión" (`extend_booking` / `useExtensionPrefill`): verificar que asigne el periodo del tramo; ajustar si falta.
  - Seeds e2e (`e2e_seed_*`): actualizar para que las facturas con reserva lleven periodo (sino el `CHECK` rompe los tests).
- No tocar archivos autogenerados.

### Fase 5 — Verificación
- `bun run lint` y `tsgo` sin errores.
- `bunx vitest run` (suite de invoices + computeMaxCreditable).
- Smoke SQL: confirmar `count(*)` de facturas con `booking_id NOT NULL AND billing_period_start IS NULL AND status <> 'cancelled'` = **0**.
- Actualizar `public/changelog.json`, `public/version.json`, `CHANGELOG.md` y `public/changelog/v7.x.x.json` (versión minor por cambio estructural + UI).

## Reglas del proyecto respetadas
- No crear tablas nuevas (no aplica GRANT/policy).
- `CHECK` inmutable, no dependiente del tiempo.
- No tocar archivos autogenerados ni schemas prohibidos.
- Localización mexicana, changelog en español.

## Riesgo principal
El backfill con la heurística "mes de emisión" puede no coincidir con el periodo real cobrado en casos atípicos (renta que inicia a mitad de mes, extensiones). Por eso la Fase 2 exige la query de no-colisión y la validación de finanzas antes de cerrar. Si una colisión no se resuelve, el `UPDATE` del backfill falla controladamente y no se aplica el `CHECK` hasta que esté limpio.

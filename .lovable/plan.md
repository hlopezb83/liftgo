# fix-26: REP en cancelación, límites de feedback y prorrateo del último ciclo

Los tres hallazgos del diff se validaron contra el código y la base de datos: son bugs reales y ninguno está aplicado todavía.

## R4-04 — Cancelación de REP "en proceso" queda atorada

Confirmado: la consulta de pagos no trae las columnas `rep_cancellation_*`, y aunque la función de servidor `refresh-cancellation-status` ya acepta `payment_id`, ningún hook de la app la llama con un pago. Resultado: un complemento de pago cuya cancelación quedó pendiente ante el SAT no muestra ese estado y el usuario puede volver a pulsar "Cancelar REP" sin poder resolverlo nunca.

Cambios:
- Agregar `rep_cancellation_status`, `rep_cancellation_motive` y `rep_cancellation_reason` a las columnas seleccionadas de pagos.
- Nuevo hook `useRefreshRepCancellationStatus(paymentId)` que invoca la función con `payment_id` e invalida las listas de pagos y facturas.
- En el historial de pagos: mostrar la insignia "Cancelación REP en proceso", ocultar el botón "Cancelar REP" mientras está pendiente y ofrecer "Consultar estado SAT".

## R4-30 — Límites del formulario de feedback desalineados con la base

Confirmado en la base: los CHECK aceptan título de 3 a 300 caracteres y descripción de 10 a 5000, pero el formulario exige 5-120 y 10-2000. El formulario es más estricto de lo necesario y bloquea reportes válidos.

Cambio: alinear el esquema de validación a 3-300 (título) y 10-5000 (descripción).

## R4-31 — Prorrateo del último ciclo no se refleja en la factura

Confirmado: el preview usa `proratedPeriod` (primer o último ciclo) pero la línea que se envía a la factura sigue usando el flag local de solo primer ciclo, así que la descripción de una factura del último mes no dice "prorrateado N días" aunque el monto sí esté prorrateado.

Cambio: propagar `isProrated: proratedPeriod` y `proratedDays` solo cuando el período está prorrateado, en la generación de facturas recurrentes.

## Detalles técnicos

- `src/features/invoices/hooks/usePayments.ts`: ampliar `PAYMENT_COLUMNS`.
- `src/features/invoices/hooks/invoices/cfdi/useRefreshCancellationStatus.ts`: agregar el hook para REP con `paymentKeys.all` + `invoiceKeys.all`.
- `src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx`: badge, guard `!repCancelPending` y botón de consulta.
- `src/features/feedback/lib/schema.ts`: nuevos mínimos/máximos.
- `supabase/functions/generate-recurring-invoices/index.ts`: líneas ~359-360.
- Sin migraciones: los CHECK ya existen en la base.

## Verificación

Lint, typecheck, `bun test` completo y build. Versión **v7.356.0** (minor) con entrada nueva en el changelog.

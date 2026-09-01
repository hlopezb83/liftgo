# Facturas recurrentes: la vista previa muestra octubre en vez de septiembre

## Qué está pasando (diagnóstico confirmado en la base de datos)

No es un error de fechas ni de zona horaria: **las facturas de septiembre ya se generaron solas**.

La tarea automática corrió el 1 de septiembre a las 00:15 (hora Monterrey) y creó 8 borradores con periodo 01/09/2026 – 30/09/2026 (BORRADOR-0047 a BORRADOR-0054), cubriendo las 17 reservas con facturación recurrente. Por eso todas quedaron con `last_billed_date = 2026-09-30`.

Cuando el usuario abre la vista previa horas después, el sistema calcula "¿cuál es el siguiente periodo sin facturar?" y la respuesta correcta es octubre. Como octubre todavía no empieza, lo marca como "Período futuro". Septiembre ni siquiera aparece en la lista, porque el cursor ya avanzó más allá.

Analogía: es como abrir el buzón después de que el cartero ya pasó. El buzón está vacío no porque falte tu correo, sino porque ya lo recogieron por ti — pero la pantalla no te lo dice.

## Qué hay que arreglar

El problema real es de **comunicación**, no de cálculo. La vista previa debe decir claramente "el periodo de septiembre ya está facturado, aquí están las facturas", en lugar de mostrar octubre como si fuera la única opción.

Cambios propuestos (solo en la vista previa; la generación real no se toca):

1. **Mostrar el periodo actual ya facturado.** Cuando el siguiente periodo calculado cae en el futuro y el último periodo facturado es el mes en curso, la vista previa emitirá una línea `already_invoiced` para ese periodo, con el número de factura y su liga — igual que ya hace cuando detecta duplicados a mitad de mes.
2. **Conservar la línea de "Período futuro"** solo como información secundaria, para que se vea cuándo tocará el siguiente cobro. Sin cambiar la lógica de elegibilidad.
3. **Aviso en el encabezado del diálogo** cuando no hay nada elegible pero sí hay periodos ya facturados: texto tipo "El periodo de septiembre 2026 ya fue generado automáticamente el 01/09/2026. Consulta los borradores en Facturas."

## Detalles técnicos

- `supabase/functions/generate-recurring-invoices/index.ts`, dentro de `buildPlan`: antes de romper el ciclo por `nowMty < billingStart`, si `firstIteration` y `effectiveLastBilled` pertenece al mes en curso (hora Monterrey), buscar en `invoice_bookings` la factura del periodo `[inicio de mes, effectiveLastBilled]` y empujar una línea `already_invoiced` con `existingInvoiceId` / `existingInvoiceNumber`, además de la línea `period_in_future`.
- No se altera `items` (el plan de generación), ni las guardas de `no_exchange_rate`, `no_monthly_rate`, `booking_ended`, `rateWarning` / `allowStaleRate`, ni el RPC de creación.
- Frontend: `RecurringPreviewBody.tsx` / `RecurringInvoicesPreviewDialog.tsx` solo agregan el aviso de encabezado; el orden de la lista pone primero las ya facturadas.
- Sin cambios de esquema, RLS, triggers ni permisos.
- Pruebas: extender `generate-recurring-invoices/index_test.ts` con un caso "mes en curso ya facturado ⇒ línea already_invoiced + línea period_in_future, cero elegibles".
- Changelog: entrada patch (corrección de UX de vista previa).

## Pregunta abierta

Si prefieres que además la tarea automática **no** genere los borradores el día 1 y deje esa decisión al operador, es un cambio distinto (de política, no de UI) y lo planeo aparte.

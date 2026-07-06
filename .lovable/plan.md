## Objetivo

Permitir que el botón "Generar recurrentes" vuelva a generar la factura de un periodo cuando el borrador previo fue **cancelado** (además de eliminado, que ya funciona).

## Cambio único

En `supabase/functions/generate-recurring-invoices/index.ts`, ambos chequeos de idempotencia (`buildPlan` línea ~178 y `executePlan` línea ~243) deben **excluir facturas canceladas** al buscar vínculos existentes en `invoice_bookings`.

Ajuste al filtro:

```ts
.eq("invoices.billing_period_start", startStr)
.eq("invoices.billing_period_end", endStr)
.neq("invoices.status", "cancelled")
.neq("invoices.cfdi_status", "cancelled")
```

Aplicado en los dos lugares.

Con esto:
- Borrador **eliminado** → sigue funcionando (cascade borra el pivote).
- Borrador **cancelado** → el pivote queda, pero la consulta lo ignora y la reserva vuelve a estar elegible para el mismo periodo.
- Factura timbrada y luego cancelada ante el SAT → también se destraba (comportamiento consistente: si oficialmente no existe, se puede rehacer).

## Auto-heal de `last_billed_date`

`buildPlan` ya tiene un bloque (líneas 122-132) que resetea `effectiveLastBilled = null` si no hay factura vinculada al último periodo facturado. Debe hacer el mismo filtro de canceladas ahí para que, tras cancelar, la reserva no quede atascada apuntando a un periodo "facturado" que ya no cuenta.

## Deploy

Redeploy de `generate-recurring-invoices`.

## Tests

Extender `supabase/functions/generate-recurring-invoices/index_test.ts` con un caso: reserva con factura cancelada para el periodo → debe aparecer como `eligible` en el preview y crear una nueva factura al ejecutar.

## Changelog

Entrada patch `v6.107.3`:
- Título: "Regenerar recurrentes tras cancelar borrador"
- Detalle: cancelar una factura (borrador o timbrada-cancelada) ahora libera la reserva para que el botón de recurrentes pueda volver a generar la factura de ese periodo.

## Fuera de alcance

- UI de "Cancelar vs Eliminar" en el detalle de borradores.
- Auto-corrección retroactiva.

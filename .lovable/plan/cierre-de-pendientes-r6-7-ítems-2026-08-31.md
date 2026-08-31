# Cierre de pendientes R6 (7 ítems)

Verifiqué cada hallazgo contra el código y la base de datos actual. Resumen de lo confirmado antes de planear:

- `booking_is_returned` existe y solo `has_open_rental` lo usa; hay 5 predicados viejos con `deliveries.type='return'`. En la base no existe ni una sola fila con `type='return'` (solo `delivery`), así que el criterio viejo nunca se cumple: confirmado.
- `return_inspections` NO tiene columna de estatus, así que la observación de "criterio laxo" no aplica: cualquier fila ya es una inspección real. No hay nada que endurecer ahí.
- Régimen fiscal: hoy los datos guardados están limpios (`601`, `612`, `616`, `605`, `624`, `626` y vacíos), pero no hay validación preventiva en el servidor antes de llamar al PAC. Existe ya el catálogo `src/lib/fiscal/regimenFiscal.ts` con `isValidRegimenFiscalCode`.
- Lote de pagos CxP: la RPC `cancel_supplier_payment_batch` y el hook `useCancelPaymentBatch` YA existen y están conectados en `useExportPaymentsForm`. Lo que falta es la red de seguridad para lotes huérfanos/abandonados, no la cancelación en sí.
- Recurrentes: `rateWarning` existe y es no bloqueante (confirmado en `generate-recurring-invoices/index.ts:297`).
- Contratos firmados: el snapshot guarda solo 6 campos del montacargas y 6 del cliente; `fetchers.ts` ya lee `template` del snapshot, pero como el trigger nunca lo guarda, siempre cae a la plantilla viva. Confirmado.
- MRR previo: no encontré `v_mrr_prev` en la base ni en el código. La función vigente `get_mrr_detail` ya aplica FX correcto (sin 1:1) y reporta `fx_missing_count`. Este ítem queda como "investigar y confirmar" antes de tocar nada.

## Fase 1 — Criterio único de devolución (prioridad máxima)

Nueva migración que reemplaza el predicado viejo por `booking_is_returned(b.id)` en los 5 consumidores:
`sync_forklift_rental_status`, `cancel_booking`, la vista `v_booking_occupancy`, el guard de `create_booking` / `get_available_forklifts`, y `validate_transition` (la regresión de esta ronda).

Además:
- `CHECK` en `deliveries.type` con los valores reales que usa la app (`delivery`, `pickup`), documentando que `return` ya no es el mecanismo de devolución.
- Prueba SQL de humo: entrega → inspección de retorno → salir de `rented` por UPDATE directo debe permitirse, y la unidad debe aparecer disponible en occupancy y en `get_available_forklifts`.

No se toca `booking_is_returned` (no hay estatus intermedio que exigir).

## Fase 2 — Régimen fiscal: fail-fast antes del PAC

- Servidor (`stamp-cfdi`): validar `regimen_fiscal` contra el catálogo SAT y rechazar con 422 antes de llamar a Facturapi si no casa `^\d{3}$` o no existe en el catálogo. Mismo filtro de saneo en `parse-csf`.
- Captura: normalizar a solo el código en los tres formularios (cliente, proveedor, datos fiscales), mostrando la descripción únicamente como etiqueta.
- No hace falta migración de datos: los valores actuales ya son códigos de 3 dígitos.
- Prueba: timbrar con `"601 - General de Ley…"` falla localmente con 422, sin llamada al PAC.

## Fase 3 — Lotes de pago CxP abandonados

- Trigger `BEFORE DELETE` sobre el lote que limpie `payment_in_progress_at` en las facturas del lote que no quedaron pagadas.
- Barrido defensivo: al cargar la lista de pagos exportables, liberar facturas con `payment_in_progress_at` más viejo que 24 h cuyo lote ya no exista.
- Prueba: abandonar el wizard → la factura vuelve a ser pagable.

## Fase 4 — Contrato firmado: snapshot completo

- Ampliar el trigger de snapshot para capturar la plantilla completa del contrato y los campos faltantes del montacargas (`acquisition_cost`, `manufacturer`, `capacity_kg`, `fuel_type`) y del cliente (`contact_person`, `representante_legal`, `domicilio_fiscal_cp`).
- Unificar el naming `brand`/`manufacturer` para que `fetchers.ts` lea el snapshot sin desajustes, y leer todo del snapshot cuando exista (sin fallback a tablas vivas en documentos firmados).
- Backfill de contratos ya firmados regenerando el snapshot desde los valores actuales, marcando `snapshot_regenerated_at`, y reporte de los pagarés cuyo monto pudo salir mal.
- Prueba: firmar → editar plantilla y `acquisition_cost` → el PDF regenerado no cambia.

## Fase 5 — Recurrentes con tarifa histórica

Propuesta: **opción B (fail-closed, mínima)**. Si en el catch-up la reserva se modificó después del fin del período atrasado, no se genera esa factura: queda en una cola de revisión manual visible para el operador. Evita construir una tabla de historial de tarifas que hoy no tiene otro consumidor.

## Fase 6 — Ítems de investigación y limpieza

- MRR previo: localizar dónde se calcula el comparativo del mes anterior y confirmar si realmente hay fallback 1:1; corregir con el mismo patrón FX de `get_mrr_detail` (sin TC → excluir y contar en "sin TC") solo si se confirma.
- Gastos: persistir `supplier_bill_id` al crear un gasto desde una factura de proveedor y usarlo como criterio primario de deduplicación, dejando la heurística solo para datos legacy.
- Operativos: fijar la versión de `@sentry/react` y mover el helper de vencimiento de facturas de proveedor del test al código de producción (ancla al mediodía).

## Notas técnicas

- Todas las migraciones cumplen las reglas permanentes: `SET search_path = public`, guards de rol en `SECURITY DEFINER`, `(select auth.uid())` en policies, GRANT explícitos y `REVOKE` a PUBLIC/anon en funciones internas.
- No se toca ninguna regla de negocio, RLS ni máquina de estados existente salvo los reemplazos de predicado descritos.
- Al cerrar cada fase: versión, `CHANGELOG.md` y los JSON de changelog.

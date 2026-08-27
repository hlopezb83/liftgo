# fix-27.diff — validación y plan (R5-01, R5-02, R5-13, R5-14, R5-15)

Revisé el estado actual del código y de la base de datos: **los 5 hallazgos son bugs reales y ninguno está aplicado todavía**.

## Qué está mal hoy (verificado)

1. **R5-01 — Pagos en divisa bloqueados.** El trigger `enforce_payment_matches_invoice_currency` actualmente rechaza *cualquier* pago cuya moneda no sea idéntica a la de la factura ("Conversión multi-moneda aún no soportada"), aun cuando ya existe tipo de cambio en el pago o en la factura. Contradice al resto del sistema, que sí convierte con TC (por ejemplo `sync_invoice_status_from_payments`).
2. **R5-02 — Cancelaciones de NC/REP que mueren para siempre.** En la cola de reintentos CFDI, un 409 en `cancel_nc`/`cancel_rep` se marca como `exhausted` (fallo terminal). Pero ese 409 suele ser el propio "apartado" (`pending`) que dejó un intento anterior que se cayó por timeout después de llamar al PAC: el documento sí es cancelable, sólo está bloqueado por sí mismo.
3. **R5-13 — Liberación de apartado sin condición.** En `cancel-cfdi`, `releaseCancelClaim` pone `cancellation_status = 'none'` sin verificar que siga en `pending`, por lo que puede pisar un estado ya reconciliado con el SAT. `cancel-credit-note` ya lo hace bien; falta alinear.
4. **R5-14 — Apartado que queda colgado.** En `cancel-cfdi` y `cancel-credit-note` se marca `pacAttempted = true` *antes* de construir el cliente de Facturapi; si ese constructor falla, el apartado nunca se libera y la factura queda atorada en `pending`.
5. **R5-15 — Estado incorrecto con nota de crédito parcial.** Con NC parcial y sin pagos: una factura `paid` siempre baja a `sent` aunque ya esté vencida (debería ser `overdue`), y una factura `sent`/`overdue` nunca pasa a `partial`.

## Plan de implementación

### Base de datos (2 migraciones nuevas)
- `enforce_payment_matches_invoice_currency`: permitir el cruce de monedas cuando exista conversión (`payments.exchange_rate > 0` o `invoices.tipo_cambio > 0`); mantener el rechazo cuando no haya TC. Se dropea y recrea el trigger para que apunte a la función actualizada. Se conserva `SECURITY DEFINER` + `SET search_path = public`.
- `sync_invoice_status_from_payments`: en la rama `v_paid = 0 AND v_credited > 0`, si el estado era `paid` aplicar el mismo cálculo `overdue`/`sent` según `due_date` vs `today_mty()`; en cualquier otro caso pasar a `partial`. El resto de la función queda idéntico.

### Funciones de servidor
- `process-cfdi-retry-queue`: para `cancel_nc`/`cancel_rep` con 409, reprogramar como aplazamiento **sin consumir intento** (mismo patrón ya usado en R4-13), y disparar `refresh-cancellation-status` en modo best-effort (`payment_id` para REP, `credit_note_id` para NC) para reconciliar contra el SAT. Los 409 de `cancel` de factura siguen siendo terminales. Se actualiza el comentario de `invokeStampFn`.
- `cancel-cfdi/handler.ts`: condicionar la liberación del apartado a `cancellation_status = 'pending'`; mover `pacAttempted = true` a después de `createFacturapiClient`.
- `cancel-credit-note/index.ts`: mover `pacAttempted = true` a después de `createFacturapiClient`.

### Verificación
- Suite completa de Vitest y `deno lint` / `deno fmt` en funciones.
- Pruebas SQL puntuales del trigger de divisa (pago MXN sobre factura USD con TC → permitido; sin TC → rechazado) y de las transiciones de estado con NC parcial.
- Entrada nueva en el changelog (`minor`: cambia comportamiento de negocio en pagos y estados de factura) más el archivo MD del changelog.

# fix-33: Cola de reintentos CFDI (R6-02, R6-03, R6-08, R6-22, R6-23)

## Validación de los hallazgos

Revisé `supabase/functions/process-cfdi-retry-queue/index.ts`, `cancel-cfdi/handler.ts` y `refresh-cancellation-status/handler.ts`. Los cuatro problemas son reales:

- **R6-02 (real, alto):** cuando un `cancel_nc`/`cancel_rep` recibe 409 "claim propio pendiente", la fila vuelve a `pending` sin consumir `attempts`. Como `max_attempts` nunca se alcanza, la fila puede reintentar para siempre llamando al PAC cada ciclo.
- **R6-22 (real, medio):** el `next_retry_at` se calcula con `attempts` congelado, así que el backoff nunca crece: siempre ~2 min.
- **R6-03 (real, medio):** tras llamar a `refresh-cancellation-status`, nunca se relee el documento; si la cancelación ya quedó confirmada en el SAT, la fila sigue difiriendo en lugar de cerrarse como éxito.
- **R6-23 (real, bajo):** el `fetch` al refresh no tiene timeout y su respuesta se descarta con un `catch {}` vacío; una función colgada consume el reloj del lote de 25 filas.
- **R6-08 (parcialmente correcto — lo ajusto):** es cierto que `cancel` (facturas) también puede quedar con claim `pending` tras un timeout y merece deferral. Pero `cancel-cfdi` devuelve 409 en **dos** casos distintos: (a) claim ya en proceso — diferible, y (b) factura no cancelable por pagos aplicados (`assert_invoice_cancellable`) — terminal. El diff mete los dos en el mismo saco, lo que haría que una factura no cancelable reintente 10 veces antes de morir. Voy a distinguirlos por código de error en vez de por status HTTP.

## Cambios propuestos

1. **Contador de deferrals con columna real** (en vez del truco de escribir `[deferrals=N]` dentro de `last_error`): migración que añade `deferrals integer not null default 0` a `cfdi_retry_queue`. Es más limpio, consultable y no ensucia el mensaje de error que ve el usuario.
2. **Tope de deferrals:** superados 10 deferrals consecutivos, la fila pasa a `exhausted` con diagnóstico en `last_error`.
3. **Backoff creciente:** `next_retry_at` calculado con el contador de deferrals (2, 4, 8… min con tope de 60), en vez del fijo de ~2 min.
4. **Cierre por reconciliación:** después del refresh, releer el documento (`invoices` / `credit_notes` / `payments` según la operación) y, si la cancelación ya está confirmada, marcar la fila como `succeeded`.
5. **Refresh observable:** `AbortSignal.timeout(10_000)` en el fetch y logs de warning tanto si responde no-OK como si lanza excepción.
6. **`cancel` diferible solo cuando corresponde:** añadir `code: "CANCELLATION_IN_PROGRESS"` al 409 de claim en `cancel-cfdi` y hacer que la cola difiera únicamente ese caso; el 409 de "no cancelable" sigue siendo `exhausted` inmediato (comportamiento M-6 actual). El body del refresh usa `invoice_id` para `cancel` (ya soportado por `refresh-cancellation-status`).
7. **Reset del contador:** al terminar en `succeeded` o al avanzar con un intento real, `deferrals` vuelve a 0.

## Detalles técnicos

- Migración: `alter table public.cfdi_retry_queue add column deferrals integer not null default 0;` (tabla ya con RLS y policies; no se tocan grants ni policies existentes).
- `QueueRow` incluye `deferrals`; los dos `select` (pending y stale) lo agregan.
- Nuevo helper `isDocCancelled(admin, operation, docId)` con el mapeo: `cancel` → `invoices(status, cfdi_status, cancellation_status)`, `cancel_nc` → `credit_notes(...)`, `cancel_rep` → `payments(rep_cfdi_status, rep_cancellation_status)`.
- Pruebas: casos en `supabase/functions/process-cfdi-retry-queue/decisions_test.ts` (o test nuevo del handler) para tope de deferrals, backoff creciente, cierre por reconciliación y 409 terminal vs diferible en `cancel`.
- Changelog: nueva entrada minor (v7.368.0) en `public/changelog.json` y en el MD del changelog.

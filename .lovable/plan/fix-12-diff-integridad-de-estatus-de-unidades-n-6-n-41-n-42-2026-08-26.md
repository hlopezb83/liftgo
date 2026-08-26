# fix-12.diff — Integridad de estatus de unidades (N-6, N-41, N-42, N-38, N-39)

Revisé cada hallazgo contra las definiciones vivas en la base de datos. **Los cinco son bugs reales** y todos giran alrededor del mismo tema: una unidad entregada al cliente puede quedar marcada como "disponible" (o ser reservada/vendida) aunque físicamente no haya regresado.

## Qué está mal hoy (verificado en la base de datos)

| ID | Problema confirmado |
|----|---------------------|
| N-6 | `create_booking` y `get_available_forklifts` solo revisan traslape de fechas. Una renta vencida sin devolución registrada no bloquea ni oculta la unidad, así que se puede reservar un montacargas que sigue con el cliente. |
| N-41 | `cancel_booking`, `sync_forklift_on_booking_exit` y `sync_forklift_rental_status` definen "renta activa" como `end_date >= hoy`. Una renta vencida sin devolución no cuenta, y la unidad se degrada a `available` estando con el cliente. |
| N-42 | En `validate_transition` la guarda de renta entregada sin devolución solo aplica a `rented -> sold/retired`. Las salidas a `available`, `maintenance` y `out_of_service` pasan sin validación. |
| N-38 | `complete_return_inspection` lee el montacargas sin `FOR UPDATE` y hace `UPDATE forklifts SET status = ...` sin condición: pisa cualquier estado (incluso `sold`) y siempre escribe el status_log aunque el cambio no aplique. |
| N-39 | `apply_delivery_completed_effects` promueve a `rented` desde cualquier estado excepto `sold/retired` (pisa `maintenance` y `out_of_service`) y registra el status_log con `from_status` fijo en `'available'`, falseando la bitácora. |

Datos actuales: 21 unidades en `rented` y 0 reservas vencidas sin devolución, así que el arreglo es preventivo — no hay que reparar historial ni hacer backfill.

## Plan de implementación

Cinco migraciones SQL nuevas, en este orden (respetan las reglas permanentes: `SECURITY DEFINER` con `SET search_path = public`, guards de rol, sin `USING (true)`, sin acceso a `anon`):

1. **N-6 — Bloquear reserva de unidad no devuelta.** `create_booking` levanta excepción y `get_available_forklifts` oculta la unidad cuando existe una reserva `confirmed`, ya vencida, con `return_status <> 'returned'` y sin entrega tipo `return` completada.
2. **N-41 — Definición unificada de "renta físicamente activa".** Las tres funciones de liberación pasan a considerar activa toda reserva `confirmed` iniciada, ya sea vigente por fecha o vencida sin devolución.
3. **N-42 — Guarda en cualquier salida de `rented`.** Se amplía la validación a `available`, `maintenance`, `out_of_service`, `sold` y `retired`, exentando el flujo interno (`app.forklift_rpc = 'on'`) para que la liberación legítima tras la inspección siga funcionando.
4. **N-38 — Devolución serializada.** `complete_return_inspection` bloquea la fila del montacargas con `FOR UPDATE`, actualiza solo `WHERE status = 'rented'` y escribe el status_log únicamente si el UPDATE afectó filas.
5. **N-39 — Promoción solo desde `available`.** `apply_delivery_completed_effects` promueve únicamente desde `available` y registra el `from_status` real; se recrea el trigger.

## Detalles técnicos

- Cada función se regenera partiendo de su definición **viva actual** (obtenida con `pg_get_functiondef`), aplicando solo el delta del diff. No se pega el bloque del diff a ciegas, para no perder reglas ya presentes (validación de cotización aceptada, buffer de mantenimiento, horas extra, etc.).
- Se conservan los `REVOKE ... FROM anon` / `GRANT ... TO authenticated, service_role` del diff y se corren contra `scripts/lint-migrations.ts`.
- Nueva suite de humo `supabase/tests/r_fix12_unidades_smoke.sql` que cubre: reserva bloqueada por renta vencida sin devolución, no degradación al cancelar otra reserva, salida de `rented` bloqueada hacia `maintenance`, devolución idempotente y entrega que no pisa `maintenance`.
- Se corre `bunx vitest run` completo para confirmar que no hay regresiones en los flujos de reservas/entregas.

### Limitación conocida (la dejo documentada, no la resuelvo aquí)

La exención `app.forklift_rpc = 'on'` de N-42 la usan varios RPC además de la inspección de retorno (daños, mantenimiento), así que esos caminos siguen pudiendo mover la unidad fuera de `rented` sin devolución. Endurecerlo requiere una bandera dedicada por flujo; lo propongo como sprint aparte si te interesa.

## Changelog

Entrada nueva **v7.345.0** (minor) en `public/changelog.json` y el MD de changelog: "Integridad de estatus de unidades rentadas".

# Auditoría GUI (Ronda GUI) — validación previa y plan de aplicación

## Qué validé contra la base de datos y el código reales

Verificado (hallazgo real, se aplica):

- **GUI-DB-01** — `invoices` no tiene columna `currency` (sí `moneda`) y `get_customer_summary` sigue usando `i.currency`. Rompe detalle de cliente y estado de cuenta del portal. Confirmado.
- **GUI-DB-02** — `create_booking` no exige cotización `accepted` ni valida fecha de inicio pasada. Confirmado.
- **GUI-DB-03** — `sync_forklift_status_on_maintenance` no consulta `damage_records`: libera la unidad con daño abierto. Confirmado.
- **GUI-DB-04** — `complete_return_inspection` manda a mantenimiento solo con `damaged/major_damage/needs_repair`; `minor_damage` deja la unidad `available` con daño `reported`. Confirmado.
- **GUI-DB-06** — `contracts` tiene política `FOR ALL` para dispatcher y no hay guard de borrado. Confirmado.
- **GUI-DB-07** — `trg_sb_init_balance` marca `overdue` al insertar y `validate_transition` solo admite `draft/pending` como inicial: alta de factura de proveedor ya vencida imposible. Confirmado.
- **GUI-DB-08** — `Dispatchers full access customers` es `FOR ALL` pese a matriz = solo lectura. Confirmado.
- **GUI-DB-09** — mechanic solo tiene política SELECT en `damage_records` y no existe `start_repair_work_order`. Confirmado.
- **GUI-DB-10** — `get_feedback_leaderboard` usa `fr.reporter_type` en el SELECT sin incluirlo en el `GROUP BY`. Confirmado.
- **GUI-FE-01** — `CONVERTIBLE_STATUSES` incluye `draft` y `sent`. Confirmado.
- **GUI-FE-03** — `QuoteDetail` interno solo maneja `isLoading`, sin `isError`. Confirmado.

Matizado (se aplica con ajuste):

- **GUI-DB-05 (folios)** — en la base real las secuencias están sanas (`quote_number_seq` = 403 vs máximo COT-0358; `booking_number_seq` = 25 vs RSV-0025). No hay desfase que provoque 409 hoy; el problema descrito venía de la réplica reseedeada. Se aplica igual como defensa idempotente (setval + asignación de folio en servidor), pero **no** como corrección de un bug activo en producción.
- **GUI-FE-04** — `/fleet/new` y `/contracts/new` efectivamente no tienen guard de acceso; `/bookings/new` está marcado `adminOnly`, que es más estricto que la matriz.

## Plan de aplicación

### Fase 1 — Migraciones SQL (en orden, una por una)

1. `GUI-DB-01` corregir `i.currency` → `i.moneda`.
2. `GUI-DB-02` exigir cotización `accepted` + rechazar inicio en el pasado (con bypass `app.e2e_seed`).
3. `GUI-DB-03` no liberar unidad con daños abiertos.
4. `GUI-DB-04` cualquier condición con daño manda a mantenimiento.
5. `GUI-DB-05` setval defensivo + asignación de folio server-side.
6. `GUI-DB-06` quitar borrado de contratos por RLS + guard de borrado.
7. `GUI-DB-07` permitir `overdue` inicial en CxP cuando la factura nace vencida.
8. `GUI-DB-08` dispatcher solo lectura en clientes.
9. `GUI-DB-09` política INSERT para mechanic + RPC `start_repair_work_order` transaccional.
10. `GUI-DB-10` corregir el `GROUP BY` del leaderboard.

Después de cada bloque: `supabase--linter` y una consulta de humo por función tocada.

### Fase 2 — Frontend (P0 → P2)

- FE-01 `CONVERTIBLE_STATUSES` = solo `accepted`.
- FE-02 folio de cotización con reintento tras 23505 (apoyado en el folio server-side).
- FE-03 `QueryErrorState` con reintento en `QuoteDetail`.
- FE-04 guards de ruta en `/fleet/new` y `/contracts/new`.
- FE-05 gate de alertas de cobranza en el dashboard de ventas.
- FE-06 `DamageActions`: wrap móvil, cierre de sheet, archivar explicado, "Reparar" vía RPC.
- FE-07 date pickers sin corrimiento de día fuera de zona Monterrey.
- FE-08 detectar 0 filas en PATCH de facturas y clientes.
- FE-09 redirecciones de mechanic y `/login` con sesión activa.
- FE-10 tap targets ≥ 44px.
- FE-11 mini-diffs agrupados.

### Fase 3 — Verificación

- Suite completa de Vitest y `tsgo`.
- Script de humo SQL nuevo (`supabase/tests/r_gui_smoke.sql`) con un caso por guard nuevo.
- Revisión visual con Playwright de detalle de cliente, cotización, daños y móvil 402px.
- Changelog: entrada `minor` en `public/changelog.json` + `public/changelog/v7.267.0.json`, sincronizando `package.json` y `version.json`.

## Riesgos que quiero confirmar contigo

1. **Fecha de inicio pasada en reservas (GUI-DB-02)**: bloquearla puede impedir registrar rentas que ya empezaron (captura retroactiva). ¿La bloqueamos duro o solo advertimos en la UI?
2. **`/bookings/new` (GUI-FE-04)**: hoy es solo admin. ¿Lo alineamos a la matriz (dispatcher con acceso completo) o dejamos el criterio estricto actual?
3. **Borrado de contratos (GUI-DB-06)**: la propuesta deja borradores solo para admin. ¿Permitimos también a administrativo?

Si no indicas lo contrario, aplico: fecha pasada bloqueada, `/bookings/new` alineado a la matriz, y borradores solo admin.

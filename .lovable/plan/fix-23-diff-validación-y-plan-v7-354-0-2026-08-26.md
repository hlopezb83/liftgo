# fix-23.diff — Validación y plan (v7.354.0)

Revisé las 5 correcciones contra la base de datos real. **Las 5 son bugs reales.**

## Hallazgos confirmados

**R4-17 — La sincronización de estatus de flota se cae (real)**
`sync_forklift_rental_status` no activa la bandera interna `app.forklift_rpc`. La guarda N-42 en `validate_transition` bloquea cualquier salida de `rented` cuando existe una entrega completada sin devolución, así que el paso de `rented` -> `available` aborta la función completa. Confirmado: la definición actual no contiene ningún `set_config`.

**R4-18 — Se puede extender una reserva de una unidad en taller (real)**
`create_booking` rechaza unidades con orden de trabajo `work_status = 'in_progress'`; `extend_booking` solo valida mantenimiento programado y traslapes, no órdenes en curso. Falta paridad.

**R4-19 — Revertir desde bitácora puede fallar (real)**
`revert_audit_log` restaura filas de `forklifts`, `deliveries`, etc. sin ninguna bandera de bypass, por lo que las guardas de transición y la de entregas terminales pueden abortar una reversión legítima de administrador.

**R4-26 — Cancelar reserva puede abortar (real)**
`cancel_booking` hace `UPDATE forklifts ... status = 'available'` sin fijar `app.forklift_rpc`; la misma guarda N-42 puede tumbar la cancelación de la reserva que se está cancelando.

**R4-27 — La vista de saldos está expuesta a `anon` (real)**
`v_invoices_with_balance` tiene ACL `anon=arwdDxtm`: el rol anónimo tiene SELECT (y más) sobre la vista.

## Cambios propuestos

1. Migración R4-17: recrear `sync_forklift_rental_status` con `set_config('app.forklift_rpc','on',true)` al inicio y `'off'` al final, conservando guard de rol admin, `SET search_path = public` y el CTE `active` (que ya protege los demotes de rentas vigentes/vencidas sin devolución).
2. Migración R4-18: agregar en `extend_booking` el chequeo de `maintenance_logs.work_status = 'in_progress'` con `deleted_at IS NULL`, mismo mensaje y `ERRCODE = 'check_violation'` que `create_booking`.
3. Migración R4-19: introducir bypass `app.audit_revert` fijado por `revert_audit_log` y reconocido por `validate_transition` y `guard_delivery_completed_terminal`, limitado a la transacción de la reversión y solo para las tablas ya permitidas.
4. Migración R4-26: fijar y resetear `app.forklift_rpc` alrededor del `UPDATE forklifts` dentro de `cancel_booking`.
5. Migración R4-27: `REVOKE ALL ON public.v_invoices_with_balance FROM anon;` dejando `authenticated` y `service_role`.

## Notas técnicas

- Todas las funciones se recrean con `SECURITY DEFINER`, `SET search_path = public` y sus guards de rol actuales, conforme a las reglas permanentes de migraciones.
- Los `set_config(..., true)` son locales a la transacción; el reset explícito a `'off'` evita que el bypass sobreviva en la misma transacción llamante.
- Verificación: `scripts/lint-migrations.ts`, suites RLS/SQL y la suite Vitest completa.
- Changelog: nueva entrada **v7.354.0** (minor) al inicio de `public/changelog.json` más su archivo de detalle.

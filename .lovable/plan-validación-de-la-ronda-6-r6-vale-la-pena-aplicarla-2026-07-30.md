# Validación de la Ronda 6 (R6) — ¿vale la pena aplicarla?

Veredicto: **sí, con dos correcciones y un cambio de orden**. Validé los 16 hallazgos contra el código real y contra la base de datos viva. Ninguno está ya resuelto, ninguno de los diffs está desactualizado, y ninguna propuesta contradice las convenciones del proyecto.

## Lo que confirmé en la base de datos viva

- `damage_records` tiene políticas SELECT e INSERT para mecánico, **no UPDATE**. El botón "Marcar reparado" del mecánico efectivamente devuelve 0 filas y la unidad se queda en Mantenimiento. Real y grave.
- Siguen vivas `Administrativo full access forklifts` (ALL), `Dispatchers update forklifts` y `Dispatchers full access damage_records` (ALL), desalineadas con la matriz de permisos.
- `validate_transition` permite hoy `paid → cancelled` por PATCH directo y no exige motivo de cancelación.
- El resync de secuencias de la ronda anterior cubre cotizaciones, reservas y facturas de proveedor, pero **no `delivery_number_seq`**.
- `audit_fleet_status_consistency()` no existe.

## Dos correcciones a la propuesta

1. **R6-FE-05 (partidas $0.00 en el portal)**: la auditoría dice que las llaves reales son `qty`/`total`. Consulté las 110 partidas existentes: las llaves reales son `description`, `quantity`, `unit_price`, `total`. Es decir, **la cantidad ya funciona** y el único campo roto es el importe (`amount` no existe; es `total`). Se aplica sólo esa mitad del diff, con respaldo a `amount` por si entran partidas viejas.
2. **R6-DB-03**: la propuesta reemplaza `validate_transition` completa, y esa función gobierna además cotizaciones, reservas, facturas de proveedor y montacargas. Antes de aplicarla se compara línea a línea contra la versión vigente para garantizar que las otras ramas y el bypass de sincronización de pagos quedan idénticos.

## Orden de aplicación

Primero las 5 migraciones, después el frontend. R6-FE-01 (habilitar los botones del mecánico) sin R6-DB-01 dejaría el botón visible pero muerto.

### Fase 1 — Base de datos
- R6-DB-01: política UPDATE + guard de transiciones para mecánico; el trigger de liberación de unidad ahora cubre archivo y respeta órdenes de trabajo abiertas.
- R6-DB-02: alinear RLS de `forklifts` y `damage_records` a la matriz (administrativo sin INSERT/DELETE de unidades; despachador sin acceso directo a daños, su inspección sigue por RPC).
- R6-DB-03: `paid` deja de poder cancelarse por PATCH directo; `cancelled` exige motivo; corrección del NULL en `current_setting`.
- R6-DB-04: agregar `delivery_number_seq` al resync de secuencias.
- R6-DB-05: RPC de diagnóstico de solo lectura `audit_fleet_status_consistency()`.

### Fase 2 — Frontend
- FE-01 gate de rol en acciones de daños; FE-03 widget de seguros con `enabled`; FE-04 folio de factura y acciones de reserva gateados.
- FE-02 el aviso de devolución con daño dice "Mantenimiento" (alineado con la RPC real).
- FE-05 importes reales en el portal (con la corrección de arriba).
- FE-06 quitar el doble desfase horario en 4 puntos de guardado (usar UTC real al persistir; `nowMty` sigue para mostrar).
- FE-07 una sola definición de "rentado" en `fleetAvailability.ts`, usada por Panel, Calendario y Equipos.
- FE-08 el folio de cotización lo asigna el disparador al guardar; el formulario deja de mostrarlo y el reintento sube a 3 intentos.
- FE-09 objetivos táctiles ≥44px en breadcrumb, paginador, toggles, X de diálogo, tabs y encabezados de tabla.
- FE-10 banner de sin conexión y pantalla de reintento en lugar de splash infinito.
- FE-11 los 4 mini-arreglos (badge de contrato en portal, FAB en /reports, reinicio del rango de fechas, usuarios activos en /activity).

### Fase 3 — Verificación
- Smoke SQL nuevo (`supabase/tests/r6_smoke.sql`) para los guards de DB-01 a DB-04.
- Pruebas frontend de los gates de rol, la definición única de "rentado" y el mapeo de partidas del portal.
- `tsgo` + ESLint + suite completa de Vitest.
- Changelog y versión: entrada nueva **v7.270.0** en `public/changelog.json` y `public/changelog/v7.270.0.json`, alineando `package.json` y `version.json`.

## Notas técnicas

- El GRANT de columnas de R6-DB-01 es aditivo sobre `authenticated` (todos los roles comparten ese rol de conexión); la restricción fina vive en la política RLS y el trigger guard. Es la convención ya usada en el repo.
- R6-FE-06 deja imports huérfanos de `nowMty` en `useRolePermissions.ts` y `useContractTemplates.ts`; se eliminan en el mismo cambio.
- El `EXCLUDE`/bypass de E2E (`app.e2e_seed`, `app.e2e_teardown`) queda contemplado en todos los guards nuevos para no romper la siembra de pruebas.

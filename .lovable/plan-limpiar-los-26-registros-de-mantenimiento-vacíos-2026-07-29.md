# Limpiar los 26 registros de mantenimiento "vacíos"

## Qué está pasando (confirmado en la base de datos)

Los 26 registros son basura de las pruebas automatizadas (E2E). Todos tienen descripción "E2E Kanban WO - ...", costo 0, sin responsable, y están ligados a montacargas de prueba (`E2E-FL-...`) creados hoy 29/07.

Se ven "vacíos" por dos motivos que se suman:

1. La lista de montacargas sí excluye los equipos de prueba, pero la lista de mantenimiento no. Como la tabla busca el nombre del montacargas en esa lista filtrada, no lo encuentra y muestra "—" (analogía: la orden de trabajo apunta a una máquina que la pantalla finge que no existe).
2. Las órdenes en sí no traen datos reales: costo 0, sin proveedor, sin responsable.

Además, la limpieza automática de datos de prueba (`e2e_teardown`) no borra `maintenance_logs` — esa tabla ni siquiera tiene la marca `is_e2e` —, así que cada corrida de pruebas deja más basura acumulada.

## Plan

### 1. Marcar y limpiar (migración de base de datos)
- Agregar columnas `is_e2e` (default `false`) y `e2e_scope` a `maintenance_logs`, igual que en el resto de tablas.
- Marcar como E2E los registros existentes cuyo montacargas es E2E.
- Borrar esos 26 registros y, si quedan huérfanos, los montacargas de prueba asociados.

### 2. Que no vuelva a pasar
- `e2e_seed_scenario`: insertar las órdenes de mantenimiento con `is_e2e = true` y el `e2e_scope` correspondiente.
- `e2e_teardown`: borrar `maintenance_logs` (y `maintenance_parts`/`maintenance_labor` ligados) del scope antes de borrar montacargas, conservando el bypass `app.e2e_teardown` + `is_e2e` que ya existe.
- Guard de `is_e2e` en INSERT igual al de las otras tablas (solo se puede marcar desde las funciones de seed).

### 3. Frontend
- En `useMaintenanceLogs`, aplicar el filtro estándar `EXCLUDE_E2E_FILTER` para que la lista y el Kanban nunca muestren datos de prueba.
- Ajustar los tests de `maintenancePageHelpers` / hooks si hace falta.

### 4. Cierre
- Nueva entrada de changelog (`public/changelog.json` + `public/changelog/v7.264.1.json`, tipo patch) y sincronizar versiones.
- Correr la suite de Vitest.

## Detalles técnicos
- Migración: `ALTER TABLE public.maintenance_logs ADD COLUMN is_e2e boolean NOT NULL DEFAULT false, ADD COLUMN e2e_scope text;` + índice parcial opcional en `is_e2e`.
- El borrado debe respetar el orden FK: `maintenance_parts`/`maintenance_labor` → `maintenance_logs` → `forklifts`.
- El seed E2E del Kanban vive en `e2e_seed_scenario`; ahí se agrega el marcado.

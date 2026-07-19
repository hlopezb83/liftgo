## Auditoría v7.96.0 — Verde ✅

- 153 archivos / 1053 tests en verde.
- Migración `documents.uploaded_by` (UUID + FK), `purge_old_notifications()` en `pg_cron`, y rollback de storage en `useDocuments.ts` verificados.
- Tests nuevos (`useDocuments.upload.test.ts`) cubren autoría, rollback y errores.
- Sin regresiones detectadas.

## Siguiente fase — Sprint v7.97.0: BL-38 Mano de obra por mecánico

Único hallazgo abierto de la ronda. Requiere migración de datos + rediseño de form. Lo abordamos en 3 pasos.

### 1. Modelo de datos (migración)
- Nueva tabla `maintenance_labor` (líneas de mano de obra por mantenimiento):
  - `id uuid pk`, `maintenance_id fk`, `mechanic_id fk → profiles/user_roles`, `hours numeric(5,2)`, `hourly_rate numeric(10,2)`, `total_cost numeric(12,2) generated`, `notes text`, `created_at`.
- GRANT + RLS: `authenticated` con `has_role` (admin/administrativo/mecanico) según patrón existente.
- Índices: `(maintenance_id)`, `(mechanic_id, created_at)`.
- Trigger `recalc_maintenance_labor_cost`: al insert/update/delete, actualiza `maintenance_logs.labor_cost` (nuevo campo `numeric` default 0) y suma a `total_cost` junto con partes.
- Backfill: migrar `performed_by` (texto libre) a `notes` de una fila placeholder si existe historial; **no** intentar mapear a `mechanic_id` automáticamente (queda `NULL` para históricos).
- Mantener `performed_by` como columna legacy read-only durante 1 versión antes de dropear.

### 2. Frontend
- Nuevo sub-form `MaintenanceLaborSection` dentro del modal de mantenimiento (patrón `FormDialog` + field wrappers, ≤150 LOC).
- Selector de mecánicos: hook `useMechanics` (filtra `user_roles` con rol `mecanico`).
- Tabla compacta zebra con add/remove de líneas, total en `text-lg` MXN.
- `MobileCardList` fallback.
- Domain hook `useMaintenanceLabor(maintenanceId)` con `useEntityMutation` + `createEntityKeys`.

### 3. Tests
- Vitest: builder de payload, cálculo de totales, hook de mutación (invalidación de cache).
- Deno test para el trigger de recálculo (aritmética de labor + partes).
- RLS test: mecánico solo ve/edita su propia labor; admin ve todo.

### 4. Cierre
- Entrada nueva en `public/changelog.json` + `public/changelog/v7.97.0.json` (minor: nueva capacidad + migración).
- Memoria: actualizar `mem://features/maintenance` con el nuevo modelo de labor.

### Fuera de scope
- Reportes de productividad por mecánico (queda backlog para Ronda 3).
- Drop de `performed_by` (se difiere a v7.98.0).

¿Ejecuto v7.97.0 así, o prefieres partirlo (solo migración esta fase, UI en la siguiente)?
## Arreglar Bitácora vacía y filtrar Actividad de tests E2E

### Diagnóstico

**Bitácora (audit_logs):** Hay 1369 filas en DB y 0 marcadas con `is_e2e`. Pero `useAuditLogs` aplica `.not("old_data->>is_e2e", "eq", "true")` y `.not("new_data->>is_e2e", "eq", "true")`. PostgREST evalúa `NULL eq true` como UNKNOWN, y `NOT UNKNOWN` es UNKNOWN → la fila se descarta. **Resultado:** todas las filas (cuyo JSON no contiene la clave `is_e2e`) quedan excluidas y la UI sale vacía.

**Actividad (activity_feed):** La tabla no tiene columna `is_e2e`. El trigger `log_activity` corre sobre TODO INSERT/UPDATE/DELETE de las 14 tablas auditadas, incluyendo registros con `is_e2e=true`. Hay 490 filas del usuario E2E que la UI sigue mostrando.

### Cambios

**1. `src/features/audit/hooks/useAuditLogs.ts`**
Quitar los dos `.not(...->>is_e2e, eq, true)`. El trigger de `audit_logs` ya filtra desde el 2026-06-10 (confirmado: 0 filas con `is_e2e` en DB), así que el filtro cliente es redundante y rompe la consulta.

**2. Migración SQL** (`..._activity_feed_e2e_isolation.sql`)
- `ALTER TABLE activity_feed ADD COLUMN is_e2e boolean NOT NULL DEFAULT false`.
- Crear índice parcial `WHERE is_e2e = false` para listados.
- Modificar `log_activity()` trigger: leer `NEW.is_e2e` / `OLD.is_e2e` cuando la columna existe en la tabla origen (via `to_jsonb(NEW)->>'is_e2e'`), y propagarlo al INSERT en `activity_feed`.
- **Backfill:** `UPDATE activity_feed SET is_e2e = true WHERE actor_id = '47b14d44-caef-4ff1-bece-37883b060450'` (el usuario `e2e-admin@liftgo.test`). Además, marcar como `is_e2e=true` filas cuyo `entity_id` corresponda a registros con `is_e2e=true` en cualquiera de las 7 tablas E2E.
- Opción de purga: NO borramos historial, solo lo ocultamos (consistente con la estrategia E2E actual). Si querés que se borre en lugar de ocultar, lo agrego.

**3. `src/features/dashboard/hooks/useActivityFeed.ts`**
Agregar `.or("is_e2e.is.null,is_e2e.eq.false")` al query por defecto.

**4. Verificar `activityMetricsCalculators.ts`**
Asegurar que las métricas también ignoren filas `is_e2e=true` (o que reciban data ya filtrada del hook).

### Changelog
`v6.42.2` (patch — bugfix): "Bitácora visible y Actividad filtra movimientos de tests E2E".

### No se toca
- Trigger de `audit_logs` (ya correcto).
- `is_e2e` en las 7 tablas core (ya correcto desde v6.42.0).
- Edge functions, otras vistas.
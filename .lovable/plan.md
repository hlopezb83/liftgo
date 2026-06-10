## Problema Confirmado

36% de tu bitácora (760/2,129 registros) son operaciones de tests E2E ejecutados contra la base de datos de producción. El usuario `e2e-admin@liftgo.test` aparece activamente porque los triggers de auditoría (`audit_trigger_fn`) están instalados en 14 tablas y no filtran registros marcados con `is_e2e = true`.

## Causas Raíz

1. **Tests E2E contra producción**: `tests/e2e/fixtures/seed.ts` apunta a la instancia de Supabase de producción (`zxefrzfaynnfwazqhwxp.supabase.co`).
2. **Triggers sin filtro**: La función `audit_trigger_fn` registra INSERT/UPDATE/DELETE en TODAS las tablas auditadas sin verificar `is_e2e`.
3. **Audit logs sin columna `is_e2e`**: La tabla `audit_logs` no puede marcar sus propios registros como de prueba.

## Plan de Acción

### Paso 1 — Detener la hemorragia (DB)
Modificar `audit_trigger_fn` para que IGNORE operaciones sobre registros donde `is_e2e = true`. Esto previene que futuros tests contaminen la bitácora.

### Paso 2 — Filtrar registros existentes (Frontend)
Actualizar `useAuditLogs` para excluir registros donde `old_data->>'is_e2e' = 'true'` o `new_data->>'is_e2e' = 'true'`, de modo que la UI nunca muestre operaciones de E2E.

### Paso 3 — Limpieza opcional (DB)
Ofrecer un script/RPC para eliminar los 760 registros históricos de E2E del audit_logs, limpiando la bitácora de producción.

### Paso 4 — Separación de environments (infra)
Evaluar si es viable apuntar los tests E2E a un proyecto de Supabase separado (staging) o al menos a un esquema aislado dentro del mismo proyecto. Esto requiere revisar los secrets de CI (`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`).

## Alcance de este plan

- Migración SQL para modificar el trigger.
- Filtro en el hook `useAuditLogs`.
- Script de limpieza opcional como RPC o edge function.
- Recomendación de infraestructura (no ejecución, requiere decisión del usuario).

¿Apruebas este plan?
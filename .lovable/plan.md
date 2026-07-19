## Sprint 2 — BL-39 · Bitácora inmutable + reverso compensado (v7.100.0)

### Problema

Dos regresiones convierten la bitácora en no confiable:

1. **Política `Admins full access audit_logs` con `cmd = ALL`** → un admin puede `UPDATE`/`DELETE` filas de auditoría desde el cliente (rompe append-only).
2. **`revert_audit_log` termina con `DELETE FROM audit_logs WHERE id = p_audit_log_id`** → al revertir se borra el rastro. Un admin puede alterar datos, revertir y no dejar huella. La operación misma tampoco queda auditada.

### Fix (una sola migración)

**A. RLS append-only sobre `public.audit_logs`**

- `DROP POLICY "Admins full access audit_logs"`.
- Nueva `admin_read_audit_logs` — `FOR SELECT USING (has_role(...,'admin'))`. Se conservan las de `administrativo` y `auditor`.
- Trigger `trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs`:
  - Permite operación si `current_setting('app.audit_maintenance', true) = 'on'` (bandera que sólo activa `purge_old_notifications`-style de retención).
  - Si no, `RAISE EXCEPTION 'audit_logs is append-only'`.
- No se crea política de INSERT: el trigger `audit_trigger_fn` corre `SECURITY DEFINER`, así que sigue insertando; los clientes no pueden insertar directo (sin policy = denegado).

**B. `revert_audit_log` compensa en vez de borrar**

- Se ejecuta la reversa como hoy (INSERT→DELETE, UPDATE→restaurar, DELETE→re-INSERT).
- Ya **no** se hace `DELETE FROM audit_logs`. En su lugar el trigger `audit_trigger_fn` capturará la operación restauradora como un nuevo renglón.
- Se añade insert explícito de un renglón `action = 'REVERT'` con `changed_fields = jsonb_build_object('source_audit_log_id', p_audit_log_id)` para trazabilidad directa (no depende sólo del disparador implícito).
- Se conserva el whitelist de 11 tablas y el guardia `has_role(...,'admin')`.

### Tests

- **`supabase/tests/audit_logs_immutability.sql`** (pgTAP-style con `DO $$ BEGIN ... EXCEPTION ...` — no requiere pgTAP): intenta `UPDATE`/`DELETE` con rol authenticated impersonando admin (via `SET LOCAL request.jwt.claims`), espera excepción `append-only`.
- **`src/features/audit/__tests__/auditImmutability.test.ts`** (Vitest, sin DB): modela en TypeScript el flujo de `revert_audit_log` — dado un log original + reverso, verifica que el original persiste y el reverso queda como entrada nueva con `source_audit_log_id`.
- Opcional (si tiempo lo permite): correr `supabase--test_edge_functions` no aplica; se corre `bunx vitest run` completo.

### Frontend

Sin cambios de UI. `AuditTrailDialog` ya consume `audit_logs` en modo lectura. Si el UI mostraba un botón "Eliminar entrada", queda inutilizado por el trigger; se retira el handler únicamente si existe.

### Changelog

- `public/changelog.json` — nueva entrada `7.100.0` (minor) al inicio.
- `public/changelog/v7.100.0.json` — detalle por secciones (Contexto, Fix DB, Reverso compensado, Tests).

### Entregables

1. Migración SQL única (RLS + trigger + refactor de `revert_audit_log`).
2. Test SQL de inmutabilidad.
3. Test Vitest modelando compensación.
4. Actualización de changelog (índice + detalle).

### Fuera de alcance

- BL-35/36 (CFDI parser) y BL-37 (last admin lockout): Sprint 3.
- Recolección/purga programada de `audit_logs` con la bandera `app.audit_maintenance`: no se agenda cron todavía; el mecanismo queda listo para usarse cuando se defina retención.

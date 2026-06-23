## Diagnóstico

Dos problemas independientes contaminando `activity_feed` y `audit_logs`:

### Problema 1 — Triggers duplicados en `activity_feed`

Tres tablas tienen **dos triggers de actividad apuntando a la misma función `log_activity()`**:

| Tabla | Triggers (duplicados) |
|---|---|
| `bookings` | `activity_bookings` + `log_activity_bookings` |
| `invoices` | `activity_invoices` + `log_activity_invoices` |
| `maintenance_logs` | `activity_maintenance_logs` + `log_activity_maintenance_logs` |

Por eso cada evento aparece dos veces con el mismo timestamp:

```
22:10:34.948 — Creación de Mantenimiento (a1086dbb)
22:10:34.948 — Creación de Mantenimiento (a1086dbb)   ← duplicado
```

### Problema 2 — Filtro de E2E demasiado estrecho

Tanto `audit_trigger_fn` como `log_activity` solo descartan filas cuando la fila origen tiene `is_e2e=true`. Los E2E modernos usan el usuario `e2e-admin@liftgo.test` y entran por los mismos endpoints que el usuario real, así que la fila origen no lleva `is_e2e=true`. Resultado actual en la base:

- `activity_feed`: **302 filas** con `actor_name = 'e2e-admin@liftgo.test'`, todas con `is_e2e=false`.
- `audit_logs`: **475 filas** atadas al `user_id` de `e2e-admin@liftgo.test`.

## Fix

### 1. Migración A — Eliminar triggers duplicados

```sql
DROP TRIGGER IF EXISTS activity_bookings         ON public.bookings;
DROP TRIGGER IF EXISTS activity_invoices         ON public.invoices;
DROP TRIGGER IF EXISTS activity_maintenance_logs ON public.maintenance_logs;
```

Se conservan los `log_activity_*` (consistentes con el resto de las tablas).

### 2. Migración B — Reforzar filtro de E2E por actor

Reemplazar `log_activity()` y `audit_trigger_fn()` para que además de revisar `is_e2e` de la fila, consulten el email del actor en `auth.users` y descarten cuando coincida con el patrón E2E.

Helper interno (inline en cada función para evitar dependencias entre migraciones):

```sql
SELECT email INTO v_email
FROM auth.users
WHERE id = v_user_id;

IF v_email ILIKE 'e2e-%@%' OR v_email ILIKE '%@liftgo.test' THEN
  RETURN COALESCE(NEW, OLD);
END IF;
```

Se aplica al inicio de cada rama (INSERT/UPDATE/DELETE) en `audit_trigger_fn`, y antes del `INSERT INTO activity_feed` en `log_activity`. Envuelto en `BEGIN/EXCEPTION WHEN OTHERS THEN NULL` por seguridad (acceso a `auth.users` requiere SECURITY DEFINER, que ya tienen).

Mantienen el filtro existente por `is_e2e` de la fila para no romper los RPCs E2E que ya lo usan correctamente.

### 3. Migración C — Limpieza de filas contaminadas existentes

```sql
DELETE FROM public.activity_feed
WHERE actor_name ILIKE 'e2e-%' OR actor_name ILIKE '%@liftgo.test';

DELETE FROM public.audit_logs
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email ILIKE 'e2e-%@%' OR email ILIKE '%@liftgo.test'
);
```

Y deduplicar las filas residuales de `activity_feed` creadas por los triggers duplicados antes del fix (mismo `entity_type`, `entity_id`, `event_type`, `created_at`):

```sql
DELETE FROM public.activity_feed a
USING public.activity_feed b
WHERE a.id > b.id
  AND a.entity_type = b.entity_type
  AND a.entity_id   = b.entity_id
  AND a.event_type  = b.event_type
  AND a.created_at  = b.created_at;
```

## Sin cambios en frontend

Los hooks de actividad y bitácora ya ocultan `is_e2e=true`. Después del fix las filas problemáticas dejan de existir y de generarse.

## Changelog

Entrada `patch` `6.76.4` en `public/changelog.json` + `public/changelog/v6.76.4.json`:
- Tipo: bugfix
- Título: "Bitácora y actividad: eliminar duplicados y contaminación E2E"
- Descripción: "Se eliminaron triggers duplicados en bookings/invoices/maintenance_logs (causaban filas repetidas en Actividad). Los triggers de auditoría y actividad ahora descartan también eventos del usuario e2e-*@liftgo.test, y se limpiaron 302 filas en Actividad y 475 en Bitácora generadas por pruebas E2E."

## Fuera de alcance

- No se cambia el flujo de los tests E2E.
- No se modifican otras tablas; los triggers restantes ya están correctos.

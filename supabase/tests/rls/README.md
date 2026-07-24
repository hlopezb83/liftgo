# RLS Policy Tests — Reales (Fase 2 handoff)

Estos archivos `.sql` prueban políticas RLS **evaluándolas contra la DB real**
en lugar de mockear el cliente. Reemplazan los `*.rls.test.ts` de Vitest, que
son 100% mockeados y no ejercitan políticas.

## Estado

- **Fase 1 (v7.222.0):** archivos versionados; NO se ejecutan en CI hasta que
  el job `rls-policies` se habilite en `.github/workflows/ci.yml` con acceso a
  una DB shadow. El motivo: requerimos `SUPABASE_DB_URL` (o `supabase start`),
  ninguno de los cuales está en el pipeline actual.
- **Fase 2:** activar el job `rls-policies` (ver `.github/workflows/ci.yml`
  comentario `TESTS-RLS-PHASE2`). Habilitar `supabase start` en el runner o
  proveer `RLS_DB_URL` como secret. Correr con:
  ```bash
  for f in supabase/tests/rls/*.sql; do
    psql "$RLS_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
  ```

## Convención por archivo

Cada `.sql` sigue este patrón (transacción abortada al final para no ensuciar):

```sql
BEGIN;

-- 1. Contexto: crear 2 usuarios de roles distintos
INSERT INTO auth.users (id, email) VALUES (...);
INSERT INTO public.user_roles (user_id, role) VALUES (...);

-- 2. Poblar datos base
INSERT INTO public.<tabla> (...) VALUES (...);

-- 3. Assume rol authenticated + JWT del user A
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"<user-A-uuid>","role":"authenticated"}';

-- 4. Test: SELECT/INSERT/UPDATE/DELETE — assert count/failure esperado
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM public.<tabla>) <> 1 THEN
    RAISE EXCEPTION 'RLS fuga: user A ve % filas', (SELECT COUNT(*) FROM public.<tabla>);
  END IF;
END $$;

-- 5. Assume rol authenticated + JWT del user B (attacker)
SET LOCAL request.jwt.claims TO '{"sub":"<user-B-uuid>","role":"authenticated"}';

DO $$ BEGIN
  BEGIN
    INSERT INTO public.<tabla> (user_id, ...) VALUES ('<user-A-uuid>', ...);
    RAISE EXCEPTION 'RLS fuga: user B pudo insertar como user A';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- comportamiento esperado
  END;
END $$;

ROLLBACK;
```

## Tablas cubiertas

| Archivo | Tabla | Escenario |
|---|---|---|
| `customer_payment_intents_portal.sql` | `customer_payment_intents` | Cliente A no puede crear intent con `customer_id` de B (portal) |
| `quotes_portal.sql` | `quotes` | Cliente portal solo ve sus cotizaciones |
| `supplier_payments.sql` | `supplier_payments` | Solo admin/administrativo puede insertar |
| `user_roles.sql` | `user_roles` | Escalada de privilegio: usuario no-admin NO puede insertarse `admin` |
| `parts_inventory.sql` | `parts_inventory` | Mecánico read-only, admin escribe |
| `return_inspections.sql` | `return_inspections` | Dispatcher/admin escriben, ventas solo lee |
| `damage_records.sql` | `damage_records` | Mismo patrón que return_inspections |

Cada archivo termina en `ROLLBACK;` — es seguro correrlos contra cualquier DB
transaccional sin dejar residuos.

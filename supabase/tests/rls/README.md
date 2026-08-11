# RLS Policy Tests — Reales (Fase 2 handoff)

Estos archivos `.sql` prueban políticas RLS **evaluándolas contra la DB real**
en lugar de mockear el cliente. Reemplazan los `*.rls.test.ts` de Vitest, que
son 100% mockeados y no ejercitan políticas.

## Estado

- **Fase 1 (v7.222.0):** archivos versionados; no se ejecutaban en CI por falta
  de una DB shadow.
- **Fase 2 (v7.295.0): ACTIVA.** El workflow
  `.github/workflows/rls-db-tests.yml` (job `rls-db-tests`) levanta un Supabase
  local efímero con `supabase start`, corre `supabase db reset` (reaplica TODAS
  las migraciones desde cero, validando que apliquen limpio y en orden) y
  ejecuta estas suites contra esa DB. Los resultados se publican como JUnit
  (`reports/rls-db-junit.xml`) con `.github/actions/publish-test-results`.
  Se dispara solo cuando cambian `supabase/**` o `src/**`, y se salta en PRs
  desde forks.

Correr en local (requiere Docker y la CLI de Supabase):

```bash
supabase start
supabase db reset --no-seed
python3 scripts/run_sql_suites.py \
  --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  --dir supabase/tests/rls \
  --junit reports/rls-db-junit.xml \
  --suite-name "RLS DB" --mode strict
```

Los smoke SQL de `supabase/tests/*.sql` (c1_c2, r2, r3, r4, r9, r10) corren en
el mismo job en modo `smoke` (usan `\set ON_ERROR_STOP off` y reportan con
`RAISE WARNING 'FALLO ...'`). Son **informativos** (`continue-on-error`) porque
algunos asumen datos de staging que no existen en una DB recién creada.


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
| `billing_secrets.sql` | `billing_secrets` | Nadie (ni admin) lee llaves fiscales desde el cliente |
| `invoices.sql` | `invoices` | Ventas sin acceso; dispatcher solo lectura |
| `payments_portal.sql` | `payments` | Cliente A no ve pagos del cliente B ni registra pagos |
| `customers_portal.sql` | `customers` | Cliente ve solo su registro; mecánico sin padrón |
| `profiles.sql` | `profiles` | No auto-reactivación, no cambio de email, no perfiles ajenos |
| `notifications.sql` | `notifications` | Solo propias; solo admin/administrativo insertan |
| `audit_logs.sql` | `audit_logs` | Ventas solo prospects; bitácora inmutable |
| `role_permissions.sql` | `role_permissions` | Ventas no escala su matriz de permisos |
| `forklifts.sql` | `forklifts` | Mecánico lee la flota pero no la modifica |
| `supplier_bills.sql` | `supplier_bills` | Ventas sin CxP; auditor solo lectura |
| `company_settings.sql` | `company_settings` | Ventas no cambia el RFC emisor; cliente sin acceso |
| `contracts.sql` | `contracts` | Escritura vía matriz `has_permission`; mecánico sin acceso |
| `documents.sql` | `documents` | Mecánico solo docs de equipo/mantenimiento |
| `user_manual.sql` | `user_manual` | Cliente del portal no lee ni escribe el manual interno |
| `bookings.sql` | `bookings` | Cliente solo sus rentas; ventas read-only; INSERT directo solo admin |
| `deliveries.sql` | `deliveries` | Logística cerrada: ventas/mecánico/cliente sin acceso |
| `maintenance_logs.sql` | `maintenance_logs` | Matriz `has_permission('Mantenimiento')`: mecánico full, auditor read, ventas none |
| `status_logs.sql` | `status_logs` | Ventas escribe pero NO lee; dispatcher no borra la bitácora |
| `activity_feed.sql` | `activity_feed` | Back-office lee; solo admin escribe; cliente sin acceso |
| `collection_notes.sql` | `collection_notes` | El cliente nunca lee las notas de cobranza sobre él |
| `collection_reminders_log.sql` | `collection_reminders_log` | Bitácora inmutable desde el cliente; solo service_role registra |
| `booking_extensions.sql` | `booking_extensions` | Cliente ve solo extensiones de sus rentas y no se auto-extiende |
| `quotes_backoffice.sql` | `quotes` | Ventas full; mecánico/auditor read-only; cliente no altera su total |
| `contract_templates.sql` | `contract_templates` | Ventas no reescribe el clausulado; solo admin/administrativo |
| `rate_limits.sql` | `rate_limits` | Nadie (ni admin) la toca desde el cliente; solo service_role |
| `storage_objects_documents.sql` | `storage.objects` (bucket `documents`) | Cliente lee solo su archivo exacto; mecánico solo `forklift/` y `maintenance/`; ventas no borra |

Convención adicional en las suites nuevas: cada una prueba **anon** (`SET LOCAL
role = 'anon'`), el **cliente del portal**, el **staff según `role_permissions`**
y, donde aplica, **service_role** (`SET LOCAL role = 'service_role'`, que hace
bypass de RLS). Para cambiar de rol dentro de la transacción se usa `RESET ROLE;`
antes del siguiente `SET LOCAL role = ...`.


Cada archivo termina en `ROLLBACK;` — es seguro correrlos contra cualquier DB
transaccional sin dejar residuos.

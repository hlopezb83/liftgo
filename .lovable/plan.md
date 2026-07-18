## Problema

Sprint 1 (v7.73.0, hallazgo SEC-004) revocó `EXECUTE` sobre `public.e2e_seed_scenario` y `public.e2e_teardown` para cerrarlas en producción. Efecto colateral: el pipeline `E2E (Playwright shard 1_2)` falla porque el usuario de prueba (`authenticated`) ya no puede invocar el RPC:

```
Error: e2e_seed_scenario failed: permission denied for function e2e_seed_scenario
   at fixtures/seed.ts:62
```

Impactadas: `booking-to-invoice.spec.ts`, `full-flow.spec.ts`, `invoice-payment.spec.ts`, `quote-to-booking.spec.ts` (y sus retries). El resto del CI está verde.

Tenemos que reabrir el acceso a las RPC de seed **sin** reintroducir la exposición que SEC-004 cerró.

## Objetivo

Restablecer el shard 1 dejando `e2e_seed_scenario` y `e2e_teardown` invocables **solo** por la cuenta de test dedicada, no por cualquier `authenticated` de producción.

## Enfoque

Guardia dentro de la propia función (defense-in-depth) más `GRANT EXECUTE` limitado.

### Migración SQL

1. `GRANT EXECUTE ON FUNCTION public.e2e_seed_scenario(text), public.e2e_teardown(text) TO authenticated;` (necesario para que PostgREST enrute; el gate real está adentro).
2. Al inicio de cada función, `SECURITY DEFINER` + `SET search_path = public`, agregar:

   ```sql
   IF NOT public.is_e2e_test_user(auth.uid()) THEN
     RAISE EXCEPTION 'e2e helpers restricted to test accounts'
       USING ERRCODE = '42501';
   END IF;
   ```

3. Crear `public.is_e2e_test_user(uid uuid) RETURNS boolean` `SECURITY DEFINER STABLE` que retorne `true` si:
   - `auth.users.email` termina en `@e2e.liftgo.test` (dominio ya usado por `tests/e2e/global.setup.ts`), **o**
   - existe fila en `public.user_roles` con un rol dedicado `e2e_tester` (opcional; solo si el correo no basta).

4. Confirmar con `pg_proc` que ambas funciones quedan `SECURITY DEFINER` y con el guard.

### Sin cambios en TS

`tests/e2e/fixtures/seed.ts` y `global.setup.ts` no requieren cambios: el usuario E2E ya cumple el criterio de email.

### Verificación

- Correr localmente `bunx playwright test tests/e2e/booking-to-invoice.spec.ts --project=chromium` para confirmar que el seed vuelve a funcionar.
- Query manual: `SELECT public.e2e_seed_scenario('probe')` autenticado como un usuario no-E2E debe devolver `42501`.
- Documentar en `security-memory` que la exposición de `e2e_seed_scenario` está mitigada por guard interno, no solo por GRANT.

### Changelog

`public/changelog.json` + `public/changelog/v7.77.1.json` (patch): "Fix CI: reabre `e2e_seed_scenario`/`e2e_teardown` con guardia por email de tester para no reintroducir SEC-004."

## Riesgos

- Que la cuenta E2E se cree con otro dominio en algún entorno. Mitigación: el guard falla ruidoso y el CI lo detecta inmediatamente.
- `is_e2e_test_user` toca `auth.users` — se hace `SECURITY DEFINER` propiedad de `postgres` y `search_path` fijo, sin exponer datos.

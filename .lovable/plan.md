# Plan: Activar test E2E del portal de clientes

Usuario `portal-e2e@liftgo.test` ya existe en auth. Faltan: RPC de seed, fixture, test activado, secrets CI y changelog.

## 1. Migración: nueva RPC `e2e_seed_portal_scenario`

`SECURITY DEFINER`, `SET search_path = public`, restringida a rol `admin` (chequeo con `has_role`).

Pasos internos:
1. Resolver `v_user_id` desde `auth.users` por email recibido (`p_portal_email`). Si no existe → `RAISE EXCEPTION`.
2. Asegurar fila en `user_roles` con rol `customer` para ese user (idempotente con `ON CONFLICT DO NOTHING`).
3. Crear `customers` con `user_id = v_user_id`, `is_e2e = true`, `e2e_scope = p_scope`, nombre `E2E Portal Customer`, datos mínimos de CFDI genéricos.
4. Crear `invoices` mínimo viable: `customer_id`, status `issued`, `is_e2e = true`, `e2e_scope = p_scope`, total fijo (ej. 1000), número generado con la RPC de numeración estándar usada por el seed actual.
5. Devolver JSON `{ customer_id, invoice_id, invoice_number, total }`.

Reutilizar el patrón exacto de `e2e_seed_scenario` para mantener consistencia con teardown existente (filtra por `is_e2e=true` + `e2e_scope`).

## 2. Fixture `tests/e2e/fixtures/portalSeed.ts`

Exporta `test` (extiende base de Playwright) con fixtures:
- `portalSeed`: llama `e2e_seed_portal_scenario` con admin client (login `E2E_TEST_EMAIL/PASSWORD`) pasando `p_portal_email = process.env.E2E_PORTAL_EMAIL`. Retorna `{ customer_id, invoice_id, invoice_number, total, scope }`.
- En `finally`: llama `e2e_teardown(scope)` igual que el fixture admin.
- El test hace login UI por separado en `/portal/login` con `E2E_PORTAL_EMAIL/PASSWORD`.

Valida env vars obligatorias al inicio (mismo patrón que `seed.ts`).

## 3. Activar `tests/e2e/portal.spec.ts`

Reemplazar `test.skip(...)` por test real:
- Usar `test` del nuevo fixture.
- Login UI en `/portal/login`.
- Navegar a `/portal/invoices` (o ruta equivalente del portal).
- `expect(page.getByText(portalSeed.invoice_number)).toBeVisible()`.

## 4. CI: `.github/workflows/ci.yml`

Añadir al bloque `env:` del job e2e:
```yaml
E2E_PORTAL_EMAIL: ${{ secrets.E2E_PORTAL_EMAIL }}
E2E_PORTAL_PASSWORD: ${{ secrets.E2E_PORTAL_PASSWORD }}
```

## 5. Changelog

- `public/changelog/v6.66.3.json` (patch, tipo refactor/test)
- Entrada al inicio de `public/changelog.json`

## Acción manual pendiente del usuario

Agregar en GitHub repo → Settings → Secrets and variables → Actions:
- `E2E_PORTAL_EMAIL` = `portal-e2e@liftgo.test`
- `E2E_PORTAL_PASSWORD` = (la contraseña que asignaste al crear el user)

Sin esos dos secrets el test fallará en CI (en local funciona si los pones en `.env`).

## Detalles técnicos

- La ruta exacta del portal para facturas la confirmo leyendo `CustomerPortalRoutes.tsx` al implementar.
- El customer seedado queda vinculado al mismo `user_id` que el de auth ya creado; el portal resuelve facturas por `customer.user_id = auth.uid()` vía RLS existente.
- Reutilizo `e2e_teardown` actual — borra por `e2e_scope` en todas las tablas tagueadas, no requiere cambios.
- No toco el user de auth `portal-e2e@liftgo.test` (ya existe). El seed solo crea customer + invoice por scope y los borra al final.

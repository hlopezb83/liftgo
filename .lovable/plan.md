## Bloque B — E2E + mobile QA + Lighthouse

Objetivo: que el RC tenga señales de calidad de usuario real (no solo unit tests). Tres frentes paralelos.

## 1. Playwright E2E (5 flujos críticos)

### Setup
- `bun add -D @playwright/test`
- `playwright.config.ts` en raíz: target `http://localhost:8080` (vite dev), 1 worker, retries=1, trace on first retry, screenshot on failure.
- `tests/e2e/` con archivos por flujo.
- Fixture `tests/e2e/fixtures/auth.ts`: usa `supabase-js` con `SUPABASE_SERVICE_ROLE_KEY` para crear un usuario admin de test antes de la suite (`setup project`) y lo borra al final (`teardown project`). Credenciales del test user vienen de env vars `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (secretos de GitHub Actions).
- `storageState` reutilizable para no loguear en cada test.

### Flujos cubiertos
1. **Auth** — `/auth` → login → redirect a `/` (dashboard carga KPIs)
2. **Booking** — crear reserva RSV-XXXX desde `/bookings/new` con cliente + montacargas + fechas, verifica que aparece en lista
3. **Quote → Invoice** — desde una cotización aceptada, generar factura draft (`/invoices`)
4. **Customer Portal** — login en `/portal/login` (cliente de prueba), ver factura asignada
5. **Smoke navegación** — recorre rutas críticas (`/fleet`, `/customers`, `/maintenance`, `/reports`) y verifica que no hay error boundary

Cada test < 30s. CFDI stamp NO se incluye (depende de Facturapi externo).

### CI
Nuevo job `e2e` en `.github/workflows/ci.yml` (paralelo):
```yaml
e2e:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - checkout, bun install
    - bunx playwright install --with-deps chromium
    - bun run build && bun run preview & (espera puerto)
    - bunx playwright test
    - upload-artifact: playwright-report en fail
```
Requiere secrets: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` (este último ya existe en producción; el user lo añade manualmente al repo).

## 2. Mobile QA real (browser tool)

Usar `browser--navigate_to_sandbox` con viewport 375x812 (iPhone 13) y recorrer:
- `/auth`, `/`, `/fleet`, `/bookings`, `/bookings/new`, `/customers`, `/quotes`, `/invoices`, `/maintenance`, `/portal/login`.

Para cada ruta capturar screenshot y validar contra checklist:
- Sidebar colapsado o drawer accesible
- `MobileCardList` renderiza en vez de tabla en listas
- Formularios no se cortan (overflow-x = 0)
- Botones primarios visibles sin scroll horizontal
- Modales caben en pantalla

Reportar findings en `docs/mobile-qa-v6.13.2.md` (no se arreglan automáticamente; si hay regresiones bloqueantes se levantan como issues y se priorizan).

## 3. Lighthouse baseline

Crear `scripts/lighthouse-baseline.sh` que corre `npx lighthouse https://liftgo.lovable.app/auth --preset=desktop --output=json --output-path=docs/lighthouse/auth.json` para 3 rutas públicas (`/auth`, `/portal/login`) y 2 autenticadas se documentan como "manual".

Capturar baseline en `docs/lighthouse/baseline.md`:
- Performance, A11y, Best Practices, SEO scores
- LCP, CLS, TBT
- Fecha del baseline

No se gatea CI con esto en v6.13.2 — es solo baseline para comparar en futuras versiones.

## 4. Documentación + changelog

- `architecture.md` §15.3 nueva sección "E2E tests (Playwright)" con convenciones.
- `architecture.md` §15.4 "Mobile QA process".
- `docs/mobile-qa-v6.13.2.md` con findings de la pasada manual.
- `docs/lighthouse/baseline.md` con números iniciales.
- `mem://tech/testing` — añadir Playwright + mobile QA.
- Changelog `v6.13.2` (minor — añade suite E2E):
  - `public/changelog/v6.13.2.json`
  - Entrada en `public/changelog.json`.

## Verificación

- `bun run lint` → 0 errores.
- `bunx vitest run` → 296 verdes.
- `bunx playwright test` local → 5 flujos verdes.
- Job CI `e2e` verde (después de que el user añada los 3 secrets).
- Mobile QA documentado con findings clasificados (bloqueante / no bloqueante / mejora).

## Diagrama del flujo CI

```text
push/PR
  │
  ├── quality (lint, knip, vitest, build) ─ ya existía
  ├── edge-functions (Deno smoke) ────────── ya existía
  └── e2e (Playwright vs preview build) ──── NUEVO
```

## Fuera de alcance (queda para Bloque C)

- `docs/release-checklist.md`, `docs/runbook.md`, restore de backup.
- Visual regression (Percy / Chromatic).
- E2E del flujo CFDI real (requiere sandbox de Facturapi y cuesta dinero).
- Refactor de UI mobile para arreglar findings — solo se documentan.

## Acción que necesito de tu lado

Después de implementar, vas a tener que **añadir 3 secrets al repo de GitHub** (Settings → Secrets and variables → Actions):
1. `E2E_TEST_EMAIL` — email de un user admin dedicado a tests
2. `E2E_TEST_PASSWORD` — su contraseña
3. `SUPABASE_SERVICE_ROLE_KEY` — la service role key del backend

Sin estos, el job `e2e` falla. ¿Lo aceptas o prefieres que el job `e2e` quede como `continue-on-error: true` hasta que añadas los secrets?

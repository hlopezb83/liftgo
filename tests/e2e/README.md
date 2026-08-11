# E2E Playwright — LiftGo

Suite E2E completa. Corre contra `bun run preview` en `http://localhost:4173`.

## Requisitos

Env vars (en `.env.local` o secrets de CI):

```
E2E_TEST_EMAIL=<admin>
E2E_TEST_PASSWORD=<admin pwd>
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

# Opcionales — sin ellos los specs por rol se saltan:
E2E_VENTAS_EMAIL / E2E_VENTAS_PASSWORD
E2E_ADMINISTRATIVO_EMAIL / E2E_ADMINISTRATIVO_PASSWORD
E2E_MECANICO_EMAIL / E2E_MECANICO_PASSWORD
E2E_PORTAL_EMAIL / E2E_PORTAL_PASSWORD
```

## Comandos

```bash
bun run test:e2e                    # corre toda la suite (chromium + portal)
bun run test:e2e:ui                 # modo interactivo
bun run test:e2e:report             # abre el HTML report
```

## Cobertura Sprint J

| Área | Spec | Qué valida |
| --- | --- | --- |
| Flujo completo | `full-flow.spec.ts` | Sesión válida + cotización → reserva → factura → pago sobre un seed único (absorbe `auth`, `quote-to-booking` y `booking-to-invoice`). |
| Fiscal | `fiscal-actions.spec.ts` | Visibilidad/estado de botones fiscales en detalle de factura + smoke de `/notas-de-credito` y `/rep`. El comportamiento del PAC vive en los `handler_test.ts` de Deno. |
| Filtros | `filters-invoices.spec.ts` | Regresión StatusTabs de Facturas (bug v7.62.2). |
| Filtros | `filters-quotes.spec.ts` | StatusTabs + búsqueda `match-sorter`. |
| Filtros | `daterange-picker.spec.ts` | Regresión `DateRangePickerField` en `/quotes/new` (v7.71.2). |
| Roles | `roles-matrix.spec.ts` | Rutas y acciones permitidas por rol. |
| Portal | `portal.spec.ts` (previo) | Sesión de cliente y read-only. |
| Smoke | `smoke-nav.spec.ts` (previo) | 30+ rutas sin error boundary. |

## Autenticación (v7.300.0)

`global.setup.ts` NO usa el form de login: pide la sesión a Supabase por API
(`signInWithPassword`), valida que la cuenta sea staff y escribe
`tests/e2e/.auth/admin.json` a mano. Si hay credenciales por rol
(`E2E_<ROL>_EMAIL/PASSWORD`) también cachea `.auth/<rol>.json` para
`roles-matrix.spec.ts`. Cualquier fallo de auth revienta el setup (loud).

## Timeouts

Prohibidos los números mágicos: usa `TIMEOUTS` de `fixtures/helpers.ts`
(`short` 5s, `medium` 10s, `long` 15s, `xl` 30s, `pdf` 45s).

## Datos y limpieza

Cada test corre bajo un `e2e_scope` único (`e2e_seed_scenario` +
`e2e_teardown`). Nunca hardcodees IDs — usa la fixture `seed`.

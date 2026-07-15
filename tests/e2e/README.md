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
bun run test:e2e:update-snapshots   # actualiza baselines visuales
bun run test:e2e:report             # abre el HTML report
```

## Cobertura Sprint J

| Área | Spec | Qué valida |
| --- | --- | --- |
| Flujo completo | `full-flow.spec.ts` | Cotización → reserva → factura → pago sobre un seed único. |
| Filtros | `filters-invoices.spec.ts` | Regresión StatusTabs de Facturas (bug v7.62.2). |
| Filtros | `filters-quotes.spec.ts` | StatusTabs + búsqueda `match-sorter`. |
| Filtros | `daterange-picker.spec.ts` | Regresión `DateRangePickerField` en `/quotes/new` (v7.71.2). |
| Visual | `visual-desktop.spec.ts` | Snapshots 1600×900 en 10 rutas clave. |
| Visual | `visual-mobile.spec.ts` | Snapshots 390×800 + no overflow horizontal. |
| Roles | `roles-matrix.spec.ts` | Rutas y acciones permitidas por rol. |
| Portal | `portal.spec.ts` (previo) | Sesión de cliente y read-only. |
| Smoke | `smoke-nav.spec.ts` (previo) | 30+ rutas sin error boundary. |

## Snapshots visuales

Baselines por primera corrida en `tests/e2e/__screenshots__/`. Regenera con
`test:e2e:update-snapshots` **solo** tras un cambio de diseño intencional; los
diffs quedan en `playwright-report/`.

## Datos y limpieza

Cada test corre bajo un `e2e_scope` único (`e2e_seed_scenario` +
`e2e_teardown`). Nunca hardcodees IDs — usa la fixture `seed`.

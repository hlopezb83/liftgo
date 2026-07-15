# Sprint J — E2E con Playwright

Setup formal de `@playwright/test` + 4 suites cubriendo los alcances aprobados.

## 1. Infraestructura

```
playwright.config.ts            # baseURL http://localhost:8080, viewport 1600x900, storageState por rol
e2e/
  fixtures/
    auth.ts                     # login helpers (admin, administrativo, ventas, portal)
    supabase.ts                 # cliente con service_role para seed/teardown
    seed.ts                     # crea cliente, forklift, cotización efímeros por test
  utils/
    selectors.ts                # helpers get_by_role / testid
    money.ts, dates.ts          # asserts MXN + DD/MM/YYYY
  flows/
    quote-to-payment.spec.ts    # Suite A — flujo completo
  filters/
    invoices-filters.spec.ts    # Suite B1
    quotes-filters.spec.ts      # Suite B2
    tables-daterange.spec.ts    # Suite B3 (DateRangePicker)
  visual/
    desktop-1600.spec.ts        # Suite C — screenshots 1600x900
    mobile-390.spec.ts          # Suite C — screenshots 390x800
  auth/
    portal-readonly.spec.ts     # Suite D1
    roles-matrix.spec.ts        # Suite D2 (admin/administrativo/ventas)
.gitignore                      # + e2e/.auth, test-results, playwright-report
package.json                    # scripts test:e2e, test:e2e:ui, test:e2e:update-snapshots
```

Dependencias nuevas (devDependencies): `@playwright/test`.

`playwright.config.ts` clave:
- `projects`: `setup` (login → storageState por rol) + `desktop-1600` + `mobile-390`.
- `webServer`: reutiliza `http://localhost:8080` si ya corre; si no, `bun run dev`.
- `use.trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.
- `expect.toHaveScreenshot`: `maxDiffPixelRatio: 0.02`, `animations: 'disabled'`.

## 2. Suite A — Flujo completo (cotización → reserva → factura → pago)

`quote-to-payment.spec.ts`:
1. Login como Ventas.
2. Crear cotización (cliente semilla + forklift semilla + `DateRangePickerField` mensual).
3. Convertir a reserva desde el detalle.
4. Login como Administrativo → generar factura desde la reserva.
5. Timbrado CFDI **mockeado** (interceptar `functions/v1/stamp-cfdi` con `page.route` para no gastar folios reales).
6. Registrar pago parcial y luego saldar; asserts sobre `balance_due` y `status`.
7. Teardown: RPC `delete_quote_cascade` + `delete_booking_cascade` con service_role.

## 3. Suite B — Filtros, tablas y date pickers

- `invoices-filters.spec.ts`: alterna StatusTabs (todas → pendientes → pagadas → vencidas) **5 veces** para validar el fix del `Proxy` en `useLiftgoTable` (bug v7.62.2). Verifica que el conteo y el badge cambien cada vez.
- `quotes-filters.spec.ts`: mismo patrón con StatusTabs de cotizaciones + búsqueda `match-sorter`.
- `tables-daterange.spec.ts`: abre `DateRangePickerField` en `/quotes/new` (regresión v7.71.2), selecciona rango, cierra, reabre y valida persistencia. Se repite en filtros de reportes.

## 4. Suite C — Auditoría visual por viewport

Rutas en snapshot (autenticado como admin):
`/`, `/dashboard`, `/quotes`, `/bookings`, `/invoices`, `/cuentas-por-pagar`, `/customers`, `/fleet`, `/maintenance`, `/reports/income-statement`, `/mrr`.

- `desktop-1600.spec.ts`: `viewport 1600x900`, `toHaveScreenshot` por ruta.
- `mobile-390.spec.ts`: `viewport 390x800`, valida que `MobileCardList` reemplaza tabla.
- Baselines commit-eadas en `e2e/visual/__screenshots__/`. Script `test:e2e:update-snapshots` para actualizarlas intencionalmente.

## 5. Suite D — Portal + roles

- `portal-readonly.spec.ts`: login en `/portal/login` con cliente semilla; verifica que ve sus facturas/reservas y que **no** existen botones destructivos (`getByRole('button', { name: /eliminar|editar/i })` → `toHaveCount(0)`).
- `roles-matrix.spec.ts`: para cada rol (admin, administrativo, ventas, mecánico), navega a rutas críticas y valida presencia/ausencia de acciones según `role_permissions`.

## 6. Datos y credenciales

- **Usuarios de test**: creo 4 usuarios seed idempotentes vía migration (`e2e_admin@liftgo.test`, etc.) con contraseña en env `E2E_PASSWORD`. Solo se crean si `NODE_ENV !== 'production'`.
- **Storage state**: `setup.spec.ts` inicia sesión una vez por rol y guarda `e2e/.auth/<role>.json`, reutilizado por los demás specs (arranque rápido).
- Seed transaccional por test con prefijo `E2E-` para poder limpiar sin tocar datos reales.

## 7. Scripts npm

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:update-snapshots": "playwright test --update-snapshots",
"test:e2e:report": "playwright show-report"
```

## 8. Entregables y changelog

- Cobertura inicial: ~18 specs, 4 suites.
- Documentación breve en `e2e/README.md` (cómo correr, cómo actualizar snapshots, cómo agregar un spec).
- Changelog: **v7.72.0 (minor)** — "Sprint J: suite E2E con Playwright (flujo completo, filtros, visual, portal/roles)".

## Notas técnicas

- No toco `src/integrations/supabase/client.ts` ni `.env`. Los tests usan un helper que lee `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` desde `.env.e2e` (fuera de git).
- El timbrado CFDI se mockea siempre — nunca golpeamos Facturapi desde CI.
- Los snapshots visuales pueden variar por fuentes; documento en README cómo regenerar tras cambios de diseño intencionales.

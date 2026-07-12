# Auditoría React Router 7 — Plan de mejora

Base sólida: v7.18, layout estático, Suspense + error boundary por ruta, guards composables, `useNavigateTransition`. Los cambios corrigen inconsistencias, cierran un bug latente y añaden dos optimizaciones de UX.

## Lote A — Correctness y limpieza (bloquea drift silencioso)

1. **Fix bug**: `ROUTES.rolePermissions` → `/users/permissions` (hoy apunta a `/role-permissions`, que no existe).
2. **Quitar `future` flags** de `<BrowserRouter>` en `App.tsx` (defaults en v7, deprecados).
3. **Sincronizar `ROUTES`** con `appRoutes`: añadir entries faltantes (`damage`, `inventory`, `cuentasPorPagar`, `flujoDeCaja`, `cuentasBancarias`, `conciliacionBancaria`, `crm.cerrados`, `feedback`, `misReportes`, `leaderboard`, `settings.root`, `activity`, `audit`, `changelog`, `help`) + builders `edit` para bookings/invoices/contracts.
4. **Guardrail**: test unitario `src/routes/__tests__/routes.test.ts` que recorre `ROUTES` recursivamente y valida que cada string estático (y cada builder llamado con `":id"`) esté presente en `appRoutes` o bajo `/portal/`.
5. **Eliminar `ExpensesRedirect`**: reemplazar en `App.tsx` por `<Route path="/expenses" element={<Navigate to="/cuentas-por-pagar" replace />} />`. Borrar el archivo y su lazy import.

## Lote B — Consistencia de navegación

6. **Migrar los 2 `useNavigate` directos** a `useNavigateTransition`:
   - `src/layouts/GlobalSearch.tsx` (Ctrl+K salta a rutas lazy).
   - `HotkeysHost` en `src/layouts/MainLayout.tsx` (secuencias `g+t`).
   - `CustomerPortalLayout` y el wrapper propio quedan como están.
7. **ESLint guardrail (warn)**: `no-restricted-syntax` que marca `ImportSpecifier[imported.name="useNavigate"]` en `src/features/**` y `src/components/**` sugiriendo `useNavigateTransition` (excepciones: `src/hooks/useNavigateTransition.ts`, `src/layouts/**`).

## Lote C — UX enhancements

8. **Prefetch de chunks lazy en hover del sidebar**:
   - Extender `appRoutes` con un `loader?: () => Promise<unknown>` opcional que apunte al mismo `import()` del `lazy(...)` (evita duplicar la ruta del módulo).
   - `SidebarNavSection` dispara `loader()` en `onMouseEnter`/`onFocus` del `NavLink`, con debounce de 120ms como en las tablas.
   - Beneficio medible: click → mount inmediato en la 2ª navegación al mismo módulo.
9. **Scroll restoration manual** en `MainLayout`:
   - Hook `useMainScrollRestoration(ref)`: guarda `main.scrollTop` por `location.key` en un `Map` en memoria; al `PUSH` resetea a 0; al `POP` restaura el valor guardado.
   - Se conecta al `<main id="main-content">` existente. Sin dependencias nuevas.

## Detalles técnicos

- **No migramos a data mode / framework mode**: el proyecto es SPA con TanStack Query como capa de datos; loaders/actions duplicarían responsabilidades.
- **No convertimos rutas a árbol anidado por módulo**: rompe la simplicidad del array declarativo (`appRoutes.map`) sin beneficio real mientras el layout sea único.
- **Testing**: la suite actual (921 tests) cubre `useListFilters`, `InvoicesPage` y `StampErrorDialog` con router de memoria; los nuevos tests de `ROUTES` viven aislados (sin render).
- **Changelog**: `v7.35.0` (minor) + detalle en `public/changelog/v7.35.0.json`.

## Verificación

- `tsgo --noEmit` limpio.
- `bun run lint` sin nuevos errores; el guardrail emite warnings sobre archivos que aún no migran (0 esperados tras Lote B).
- `bunx vitest run` con nuevo test de sincronía `ROUTES ↔ appRoutes` verde.
- Smoke manual: Ctrl+K → salto a `/reports` mantiene sidebar interactivo; hover en "Facturas" del sidebar carga el chunk antes del click; volver con back a `/invoices` restaura scroll.

## Fuera de alcance

- Migración a `createBrowserRouter` + `RouterProvider` (data mode).
- Refactor de `CustomerPortalRoutes` para integrarlo al árbol principal.
- Reemplazo de `<AuthPage>` inline por ruta `/auth` pública.

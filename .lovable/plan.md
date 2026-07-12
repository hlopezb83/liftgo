# Auditoría y modernización de `react-router-dom`

## 1. Estado actual

- Versión: `react-router-dom@^7.18.1` (v7 estable, monorepo unificado).
- 50 archivos importan de `react-router-dom`. APIs usadas: `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `Link`, `NavLink`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams`, `useNavigationType`, `MemoryRouter` (tests).
- Router en `src/App.tsx` es **declarativo** (`<BrowserRouter><Routes>…`) mapeando `appRoutes` desde `src/routes/routes-config.tsx`.
- Wrappers propios que hoy duplican funcionalidad nativa de v7:
  - `src/hooks/useNavigateTransition.ts` (29 LOC) — envuelve `navigate()` en `startTransition`.
  - `src/layouts/RouteErrorBoundary.tsx` (28 LOC) — `ErrorBoundary` manual por ruta.
  - `src/layouts/hooks/useMainScrollRestoration.ts` (41 LOC) — restauración de scroll a mano.

## 2. Diagnóstico vs. v7 best practices

| Problema | Recomendación v7 |
|---|---|
| Paquete `react-router-dom` es un **re-export** de `react-router` en v7 (queda por compatibilidad). Los docs oficiales recomiendan importar desde `react-router`. | Codemod: `react-router-dom` → `react-router` en 50 archivos. |
| `<BrowserRouter>` + `<Routes>` no habilita loaders, `errorElement`, `HydrateFallback`, `ScrollRestoration` ni transitions automáticas en navegaciones. | Migrar a **Data Router**: `createBrowserRouter(routes)` + `<RouterProvider>`. |
| `useNavigateTransition` es innecesario con Data Router: v7 envuelve navegaciones en transitions automáticamente. | Eliminar hook; reemplazar 100% por `useNavigate()`. |
| `<RouteErrorBoundary>` envuelve cada `<Route element={…}>` manualmente. | Definir `errorElement` una sola vez por rama en la config. |
| `useMainScrollRestoration` reinventa lo que hace `<ScrollRestoration>`. | Reemplazar por `<ScrollRestoration getKey={…}>` con clave por `location.key`. |
| `Suspense` + `PageFallback` envuelven cada `element`. | Usar `lazy: async () => ({ Component })` en la definición de la ruta + `HydrateFallback` global. |
| Legacy redirect `/expenses` con `<Navigate>` que renderiza componente. | Definir la ruta con `loader: () => redirect("/cuentas-por-pagar")` (evita render). |
| `NavLink` propio no aprovecha `isPending` / `isTransitioning`. | Añadir estado visual `data-pending` en `NavLink` para feedback durante transitions. |

## 3. Plan de ejecución (5 fases atómicas)

**Fase A — Codemod de imports (bajo riesgo)**
- Reemplazo global `from "react-router-dom"` → `from "react-router"` en los 50 archivos. Deja `react-router-dom` en `package.json` sólo mientras dure la migración; se elimina al final.
- Verificación: `tsgo --noEmit` + `bun run build`.

**Fase B — Data Router en el árbol principal**
- Reescribir `src/App.tsx`:
  - Construir `routes: RouteObject[]` a partir de `appRoutes` con `lazy` por ruta (elimina el `Suspense` manual y el import estático de `NotFound`/`PortalLogin`).
  - Añadir `errorElement: <RouteErrorBoundary />` a nivel del layout raíz (elimina wrapping por ruta).
  - Añadir `HydrateFallback` global (`<PageFallback />`).
  - Redirect `/expenses` → `loader: () => redirect("/cuentas-por-pagar")`.
  - Sustituir `<BrowserRouter>` por `createBrowserRouter(routes, { future: { v7_partialHydration: true } })` + `<RouterProvider router={router} />`.

**Fase C — ScrollRestoration + transitions nativas**
- Montar `<ScrollRestoration getKey={(loc) => loc.pathname}/>` dentro de `MainLayout`.
- Borrar `src/layouts/hooks/useMainScrollRestoration.ts` (–41 LOC) y su ref en `MainLayout`.
- Borrar `src/hooks/useNavigateTransition.ts` (–29 LOC). Migrar sus 2 usos (`MainLayout` hotkeys, `NavLink` si aplica) a `useNavigate()` directo — Data Router ya aplica `startTransition` internamente para todas las navegaciones.

**Fase D — Portal secundario y NavLink**
- `CustomerPortalRoutes.tsx`: convertir a rama del router principal (`children` bajo `/portal`) o mantenerlo como `<Routes>` anidado si conviene el split de guard. Decisión: mantener anidado dentro del layout del portal para preservar el `AuthGuard`, pero re-exportado con `Route` v7 (sin cambios funcionales).
- `NavLink.tsx`: usar la render prop `({ isActive, isPending }) => …` para pintar `data-pending` durante lazy chunk load (feedback visual gratis).

**Fase E — Limpieza**
- Retirar `react-router-dom` de `package.json` (queda sólo `react-router`).
- Actualizar `MemoryRouter` en tests: import desde `react-router`.
- Publicar `v7.49.0` en changelog (index + detalle).

## 4. Impacto estimado

- **LOC borrados**: ~100 (wrappers propios) + reducción de boilerplate `<Suspense>` / `<RouteErrorBoundary>` por ruta en `App.tsx` (~40 LOC).
- **Bundle**: 1 paquete menos alias (`react-router-dom` re-export) y mejores `lazy` chunks manejados por el router (dedupe del `Suspense` de segundo nivel).
- **UX**: navegación con `isPending` y `<ScrollRestoration>` nativos → feedback consistente en toda la app.
- **Riesgo**: bajo-medio. La Fase B toca el bootstrap; se valida con `build` + smoke test de rutas críticas (`/`, `/cotizaciones/:id`, `/portal/login`).

## Detalles técnicos clave

- `lazy` en `RouteObject`: `{ path, lazy: async () => { const m = await import("…"); return { Component: m.default }; } }`.
- `errorElement` recibe el error vía `useRouteError()` — `RouteErrorBoundary` se reescribe como componente que lo consume (elimina el `try/catch` manual actual).
- `redirect()` en loader retorna 302 sin montar componente → arregla el flash del `<Navigate>` legacy.
- `future.v7_partialHydration: true` habilita `HydrateFallback` por rama (mejor UX que fallback global).

## Fuera de alcance
- No se agregan `loader`/`action` de datos por ruta (mantendremos TanStack Query como fuente de datos; sólo usamos Data Router para navegación/estructura).
- No se toca lógica de negocio ni RLS.

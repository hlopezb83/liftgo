
## Goal

Prevent a single failed lazy chunk (network blip, stale deploy, corrupt build) from blowing up the whole app shell or rendering a blank screen. Today `MainLayout` wraps `<Outlet />` in one global `ErrorBoundary`, but:

- A render error in any route unmounts the shell-level boundary's children — the user sees the generic full-page error and loses sidebar/topbar context.
- The portal route (`/portal/login`) and the `NotFound` route are not wrapped at all.
- The existing `ErrorBoundary` already auto-reloads on stale-chunk errors, but only offers "Recargar" / "Inicio" — no explicit "Refrescar App" wording, no error id, no detail toggle.

## Plan

### 1. Enhance `src/layouts/ErrorBoundary.tsx`
- Add an optional `routeLabel?: string` prop so route-scoped boundaries can show "No se pudo cargar el módulo {routeLabel}" instead of the generic copy.
- Add an optional `scope?: "app" | "route"` prop. When `scope="route"`, the fallback renders inside the existing shell (no `min-h-screen`) — uses `min-h-[60vh]`, keeps sidebar/topbar visible.
- Rename primary action to **"Refrescar app"** (calls `window.location.reload()`), keep secondary **"Ir al inicio"**.
- Detect chunk-load failures (already partially done in `componentDidCatch`); on detection, show a distinct copy: "Hay una nueva versión disponible. Refresca para continuar." and auto-reload once (existing behavior preserved).
- Reset `vite-preload-reload` sessionStorage flag when user clicks Refrescar so retries work.
- Keep a collapsible `<details>` with `error.message` for debugging (already shown as `<pre>`; wrap in `<details>` so it's not noisy by default).

### 2. Create `src/layouts/RouteErrorBoundary.tsx`
Thin wrapper that:
- Uses `useLocation()` to key the boundary on `pathname` — a fresh navigation auto-resets the error state so the user isn't stuck on a previously-failed route.
- Renders `<ErrorBoundary scope="route" routeLabel={…}>{children}</ErrorBoundary>` with a `key={pathname}`.
- Looks up a human label from `appRoutes` (optional: fall back to pathname).

### 3. Update `src/App.tsx`
Wrap each `<Suspense>` block in `RouteErrorBoundary` so a single failed chunk only takes down that route:

```tsx
<Route
  path={path}
  element={
    <RouteErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        {module ? <RoleGuard module={module}><Component /></RoleGuard> : <Component />}
      </Suspense>
    </RouteErrorBoundary>
  }
/>
```

Apply the same wrapping to:
- `/portal/login` route (currently bare `<Suspense>`).
- The `*` (NotFound) catch-all.

The shell-level `ErrorBoundary` inside `MainLayout` stays as a last-resort outer net.

### 4. Verify
- Vitest suite still green (no logic changes to features).
- Manually simulate by throwing inside a lazy module: confirm sidebar/topbar remain, fallback shows "Refrescar app".
- Confirm stale-chunk auto-reload path still fires (`vite:preloadError` listener in `main.tsx` is untouched).

### 5. Changelog
Add `6.22.4` patch entry to `public/changelog.json` + `public/changelog/v6.22.4.json` describing the route-scoped error boundary and Refrescar app fallback.

## Files touched

- `src/layouts/ErrorBoundary.tsx` (enhanced)
- `src/layouts/RouteErrorBoundary.tsx` (new)
- `src/App.tsx` (wrap lazy routes)
- `public/changelog.json` + `public/changelog/v6.22.4.json`

No backend, no business logic, no styling-system token changes.

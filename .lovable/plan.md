# Plan: Verificación del fix de scroll en el resto de la app

## Verificación realizada

- El único hook que engancha `useDrag` de `@use-gesture/react` es `usePullToRefresh` (ya arreglado en v7.86.1).
- El único consumidor de ese hook es `ListPageLayout` (`/customers`, `/bookings`, `/quotes`); todas esas rutas viven bajo `MainLayout`, que ahora ya tiene `overscroll-contain`.
- El resto de contenedores con `overflow-auto` son inertes:
  - `src/layouts/ErrorBoundary.tsx`: `<pre>` de detalle de error (no scrollable a nivel página).
  - `src/features/users/pages/RolePermissionsPage.tsx`: matriz de permisos dentro de una card (scroll horizontal interno).
- **Único hallazgo pendiente**: `src/layouts/CustomerPortalLayout.tsx:81` — el `<main>` del portal usa `overflow-auto` sin `overscroll-contain`. No sufre el bug del hook (el portal no monta `usePullToRefresh`), pero sin `overscroll-contain` el navegador móvil puede disparar pull-to-refresh nativo en el portal cliente. Es la misma clase de riesgo que corregimos en `MainLayout`.

## Cambio

### 1. `src/layouts/CustomerPortalLayout.tsx`
- Añadir `overscroll-contain` al `<main>` para paridad con `MainLayout` y prevenir pull-to-refresh nativo del navegador dentro del portal.

### 2. Verificación
- Playwright a 390×675 en `/portal/*`: confirmar que el scroll vertical sigue funcionando y no hay pull-to-refresh nativo.

### 3. Changelog
- Nueva entrada `public/changelog/v7.86.2.json` (patch: paridad `overscroll-contain` en el portal cliente) + entrada en `public/changelog.json`.

## Fuera de alcance
- Cambios adicionales al hook (ya resueltos en v7.86.1).
- Contenedores `overflow-auto` internos de componentes (ErrorBoundary, RolePermissionsPage) — no son la superficie principal de scroll.

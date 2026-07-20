## Problema

En móvil (390×675), el scroll con el dedo no funciona en la app (dashboard y otras rutas).

**Causa raíz confirmada por inspección DOM en Playwright:**

- `MainLayout` renderiza `<div className="min-h-[100dvh] flex w-full">` con `<main className="flex-1 overflow-auto overscroll-contain">` adentro.
- Con `min-h-[100dvh]` (no `h-[100dvh]`) el contenedor padre **crece** al tamaño del contenido (medí `parent.height = 3097.5px` con viewport 675px).
- Como resultado, `main` también crece: `main.scrollHeight === main.clientHeight === 3098px`. **`main` deja de ser un scroll container real** (no tiene overflow que recortar), y el scroll recae en `body`/`html`.
- En navegadores móviles (especialmente iOS Safari y Chrome Android en modo `is_mobile`), cuando un ancestro cercano tiene `overflow: auto` + `overscroll-behavior: contain`, el hit-test del gesto táctil apunta a ese ancestro. Como no puede scrollear (sh==ch) **y** `overscroll-contain` evita chaining hacia el body, el gesto queda "muerto".
- Adicionalmente, `useMainScrollRestoration` escribe `main.scrollTop`, asumiendo que `main` es el scroll container. Hoy es un no-op silencioso porque el scroll real está en el `body`, así que también rompe la restauración de scroll al navegar.

El mismo patrón existe en `CustomerPortalLayout` (v7.86.2).

## Fix

Fijar la altura del contenedor padre a `h-[100dvh]` para que `main` sea un scroll container acotado y real. Con eso:

1. `main.clientHeight` queda en 675px, `scrollHeight` crece con el contenido → scroll táctil funciona dentro de `main`.
2. `overscroll-contain` cumple su propósito original (bloquear pull-to-refresh nativo).
3. `useMainScrollRestoration` vuelve a funcionar (main es el elemento scrollable).
4. `usePullToRefresh` sigue apuntando al mismo `main` (comportamiento intacto).

### Cambios

- `src/layouts/MainLayout.tsx` (línea 72): `min-h-[100dvh]` → `h-[100dvh]`.
- `src/layouts/CustomerPortalLayout.tsx`: aplicar el mismo cambio en su contenedor raíz para mantener la paridad establecida en v7.86.2.

### Verificación

- Playwright headless a 390×675 con `is_mobile=true`, `has_touch=true`:
  - Confirmar `main.clientHeight ≈ 675` y `main.scrollHeight > 675` en `/` y en una ruta con `ListPageLayout` (`/invoices`).
  - Simular swipe táctil y verificar que `main.scrollTop` avanza.
  - Regresión de sticky header, FAB con `env(safe-area-inset-bottom)` y pull-to-refresh.
- Verificar portal `/portal/*` con la misma prueba.

### Changelog

- `public/changelog.json` + `public/changelog/v7.104.2.json`: patch "Mobile: fix scroll táctil bloqueado por `min-h-[100dvh]` en MainLayout y CustomerPortalLayout".

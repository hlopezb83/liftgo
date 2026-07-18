# Plan: Móvil ya no puede hacer scroll hacia arriba después de bajar

## Diagnóstico verificado

- `<main>` en `MainLayout.tsx:80` es el único contenedor scrollable (`overflow-auto`).
- `ListPageLayout` monta `usePullToRefresh` sobre ese `<main>` cuando `isMobile && onRefresh`. `/customers`, `/bookings`, `/quotes` pasan `onRefresh={refetch}`, así que el hook está activo en la ruta actual.
- `usePullToRefresh` (src/hooks/usePullToRefresh.ts) llama a `useDrag` de `@use-gesture/react` con `eventOptions: { passive: false }` y `pointer: { touch: true }`. En `node_modules/@use-gesture/core/dist/actions-*.esm.js` (líneas 752, 786, 1169, 1179, 1210, 1351) la librería llama `event.preventDefault()` internamente en múltiples ramas del handler no-pasivo — no sólo cuando nosotros lo pedimos.
- Consecuencia: aunque el hook llame `cancel()` en cuanto detecta `scrollTop > 0`, el touchmove ya fue procesado como no-pasivo y el navegador ignora el scroll nativo hacia arriba en algunos frames. Por eso, después de bajar, "el dedo no puede subir".

## Cambios

### 1. `src/hooks/usePullToRefresh.ts`
- Cambiar `eventOptions` a `{ passive: true }` (o eliminar el flag): dejamos que el scroll nativo del navegador siga funcionando siempre.
- Quitar `event.preventDefault()` dentro del handler (ya no se puede llamar en modo passive, y no lo necesitamos si bloqueamos la refresco nativo por CSS).
- Mantener la lógica de dominio (gate `scrollTop === 0`, easing, threshold, trigger).
- Añadir `axis: "y"` + `threshold: 8` para que taps y micro-drags horizontales no activen el gesto.

### 2. `src/layouts/MainLayout.tsx`
- Añadir `overscroll-behavior-contain` (Tailwind: `overscroll-contain`) al `<main>` para desactivar el pull-to-refresh nativo del navegador dentro de ese contenedor. Así compensamos que ya no llamamos `preventDefault` en el hook.

### 3. Verificación
- Playwright a 390×675 en `/customers`: hacer scroll hasta abajo, luego arrastrar dedo hacia arriba → `main.scrollTop` debe decrecer.
- Repetir en `/bookings` y `/quotes` (mismos consumidores de `onRefresh`).
- Confirmar que el indicador "Desliza para actualizar" sigue apareciendo al arrastrar desde `scrollTop === 0`.
- `bun run test` para regresiones de `usePullToRefresh.test.ts`.

### 4. Changelog
- Nueva entrada `public/changelog/v7.86.1.json` (patch: fix scroll bloqueado en móvil después de llegar al fondo) + entry en `public/changelog.json`.

## Fuera de alcance
- Rediseño del pull-to-refresh o cambio de librería.
- Cambios en desktop/tableta (el hook sigue inactivo ahí).

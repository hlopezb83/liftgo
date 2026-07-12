## Objetivo

Cerrar el hallazgo 7/7 del audit de código custom-made migrando `src/hooks/usePullToRefresh.ts` a `@use-gesture/react` sin cambiar la API pública ni el comportamiento visual en móvil.

## Alcance

**Sí:** el hook `usePullToRefresh` y su consumidor `ListPageLayout`.
**No:** el componente `PullToRefreshIndicator`, el layout de `<main>`, ni el resto de la app.

## Pasos

1. **Instalar dependencia**
   - `bun add @use-gesture/react@^10.3.1` (~13 KB gz, mantenida por Poimandres; ya validada como estable).

2. **Reescribir `src/hooks/usePullToRefresh.ts`**
   - Sustituir `useEffect` + listeners manuales de `touchstart/move/end/cancel` por `useDrag` de `@use-gesture/react`, adjuntándolo al `target` con `target: containerRef` y `pointer: { touch: true }`.
   - Configurar en el propio `useDrag`:
     - `axis: 'y'` para bloquear a vertical.
     - `enabled` reactivo (parametrizado como hoy).
     - `from: () => [0, 0]` y `bounds: { top: 0 }` para permitir sólo pull hacia abajo.
     - Gate `active && el.scrollTop === 0` dentro del handler para respetar el requisito actual (solo dispara con scroll en tope).
   - Mantener la resistencia visual (`eased = min(maxDistance, delta * 0.5)`).
   - Al `last === true`: si `pullDistance >= threshold` disparar `trigger()`; si no, reset a 0.
   - Preservar exactamente los mismos returns: `{ pullDistance, isRefreshing, threshold }`.
   - Preservar la firma de opciones: `{ onRefresh, target, threshold?, maxDistance?, enabled? }`.

3. **Verificar consumidor**
   - `ListPageLayout.tsx` no debería requerir cambios (API pública intacta). Confirmar que sigue pasando `target={scrollTarget}` y `enabled={isMobile && !!onRefresh}`.

4. **Validación visual**
   - Playwright con viewport móvil (390×844) en `/cotizaciones` y `/reservas`: simular gesto vertical (`page.mouse.down/move/up` sobre el `<main>` con `hasTouch: true`) y verificar que aparece el `PullToRefreshIndicator` con `"Desliza para actualizar"` → `"Suelta para actualizar"` → `"Actualizando…"`.
   - Confirmar 0 errores en consola durante el drag.

5. **Test unitario del hook**
   - Añadir `src/hooks/__tests__/usePullToRefresh.test.tsx`: mount con `target=null` (inactivo), luego con un div mock; simular drag vía la API interna de `@use-gesture/react` (o vía `renderHook` + eventos sintéticos) y verificar que `onRefresh` se llama cuando `pullDistance >= threshold`.

6. **Changelog v7.61.0 (minor)**
   - Nueva entrada en `public/changelog.json` + archivo detalle `public/changelog/v7.61.0.json`.
   - Título: *"Lote G (cierre): usePullToRefresh migrado a @use-gesture/react"*.
   - Impacto: se cierra el 7/7 del audit sin cambios en API pública.

## Detalles técnicos

- **API pública sin cambios** → cero cambios en `ListPageLayout` y por transitividad cero regresiones en las páginas lista.
- **Tree-shaking**: import nombrado `import { useDrag } from '@use-gesture/react'`.
- **SSR / desktop**: `useDrag` con `enabled: false` es no-op; sigue siendo seguro pasar `enabled: isMobile && !!onRefresh`.
- **Comportamiento de scroll**: el gate `el.scrollTop === 0` se mantiene explícito para no interceptar el scroll normal.
- **Riesgo**: bajo. La lib sólo reemplaza el manejo de eventos táctiles; toda la lógica de umbral, resistencia y disparo permanece en nuestro hook.

## Criterios de aceptación

- `bun run test` verde (incluye nuevo test de `usePullToRefresh`).
- `tsgo` limpio.
- Playwright móvil: indicador aparece, cambia a "Suelta…" al pasar threshold, dispara `onRefresh` al soltar, no dispara si se cancela.
- 0 imports de `@use-gesture/react` fuera de `usePullToRefresh.ts` (mantener la migración quirúrgica).
- Changelog v7.61.0 registrado.
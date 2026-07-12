# Plan: Estabilizar CI (Knip + ESLint + E2E)

Los logs del run muestran **4 jobs fallando**. Los agrupo por causa raíz.

## 1) Knip (blocker) — 3 archivos y 5 deps sin uso

```
Unused files (3):
  src/hooks/usePrefetchOnHover.ts
  src/lib/hooks/useOptimisticListMutation.ts
  src/lib/query/useSuspenseQuery.ts

Unused dependencies:  react-router, tailwindcss-animate
Unused devDependencies: @tailwindcss/typography, tailwindcss, tw-animate-css
```

Análisis:
- **Archivos**: los tres son helpers que quedaron huérfanos tras refactors previos. Se borran.
- **`react-router`**: sólo `react-router-dom` se importa. Se remueve.
- **`tailwindcss-animate`**: reemplazado por `tw-animate-css` en el sprint Tailwind v4. Se remueve.
- **`tailwindcss`**, **`@tailwindcss/typography`**, **`tw-animate-css`**: se cargan vía `@import "tw-animate-css"` y `@plugin "@tailwindcss/typography"` en `src/index.css`, que Knip 6 no rastrea. **NO** se remueven — se agregan a `ignoreDependencies` en `knip.json` con comentario.

## 2) ESLint (blocker) — 10 errores reales

| Archivo | Línea | Regla | Fix |
|---|---|---|---|
| `src/components/dataTable/v2/DataTableHeaderV2.tsx` | 52 | `jsx-a11y/role-supports-aria-props` (aria-sort en `<button>`) | Mover `aria-sort` al `<TableHead>` padre (celda `columnheader`). |
| `src/features/bookings/hooks/useBookings.ts` | 50, 56 | `react-hooks/rules-of-hooks` (useQuery condicional) | Colapsar en un solo `useQuery` que elige queryKey/queryFn según `forkliftId`. |
| `src/features/damage/components/damage/ImageGalleryLightbox.tsx` | 23, 24, 69, 72 | exhaustive-deps + a11y | Envolver `prev`/`next` en `useCallback`; extraer swipe handlers a `<button>` o quitar listeners del `<div>` (usar wrapper con `role="group"` sin handlers de mouse/kb). |
| `src/features/invoices/hooks/invoices/useUpcomingInvoices.ts` | 23 | `no-non-null-assertion` | `toYMD(addDays(nowMty(), 30)) ?? todayKeyMty()` (o assert previo). |
| `src/features/quotes/hooks/quoteForm/quoteFormPayload.ts` | 37, 38 | `no-non-null-assertion` (×2) | `toYMD(a.startDate) ?? today` idem endDate. |

Ninguno cambia comportamiento — son limpiezas mecánicas.

## 3) E2E shard 1/2 — 3 tests flakes

```
customer-create.spec.ts:50   → dialog no se cierra tras submit (retry falla)
maintenance-kanban.spec.ts:19 → click timeout 30s
quote-pdf.spec.ts:22          → waitForEvent("download") timeout 20s
```

Diagnóstico: los tres son intermitencias clásicas de E2E, no bugs de código. **Sospecha principal**: mi cambio de fuentes a `<link rel="preload" as="style" onload>` puede haber corrido el FCP y hecho que los primeros clicks pasen antes de la hidratación en runners lentos. Propongo:

- Añadir `await page.waitForLoadState("networkidle")` en el `beforeEach` de esos tres specs (o `page.evaluate(() => document.fonts.ready)`).
- Si sigue fallando tras el push, revertir sólo el `onload` de fuentes y volver al stylesheet directo (dejando el `preconnect`). Prefiero no revertir preventivamente.

## Fuera de alcance

- Los ~2097 warnings de ESLint (`import/order`, jsx-a11y menores) — no bloquean CI, se abordan en un lote de higiene aparte.
- El warning de "Node.js 20 deprecated" en `actions/cache@v4` — pendiente de Dependabot.

## Verificación

- `bunx knip --include files,dependencies,binaries` → 0 blockers.
- `bun run lint` → 0 errores.
- `bun run build` + `bunx vitest run` → verdes.
- Changelog `v7.39.1` (patch: CI stabilization).

¿Aplico los 3 bloques en un solo PR, o preferís separar E2E flakes por si el fix no cierra el gap?

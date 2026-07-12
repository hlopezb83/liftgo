# Plan: Actualización de dependencias pendientes

Estado actual (bun outdated): 11 paquetes con nuevas versiones mayores disponibles. Los agrupo por riesgo y esfuerzo.

## Lote 1 — Bajo riesgo (patch/minor sin breaking)

- `vite` 7.3.1 → **7.3.6** (patch del major actual)
- `jsdom` 26.1.0 → mantener pinned (ya sabemos que `react-pdf` rompe con >26 — sin cambio)

Validación: build + tests.

## Lote 2 — Herramientas de lint (major, riesgo bajo-medio)

- `@eslint/js` 9 → **10**
- `eslint` 9 → **10**
- `eslint-plugin-react-hooks` 5 → **7** (nueva API de reglas para React 19)
- `globals` 15 → **17**

Ajustes esperados en `eslint.config.js`. Validación: `bun run lint`.

## Lote 3 — Tipos y build (major, riesgo medio)

- `@types/node` 22 → **26** (alinear con Node 22+ runtime)
- `@vitejs/plugin-react` 5 → **6** (compatible con Vite 7; revisar opciones de Babel/SWC)

Validación: build + `tsgo --noEmit`.

## Lote 4 — UI (major, riesgo medio-alto)

- `tailwind-merge` 2 → **3** (compatible con Tailwind v4; revisar `cn()` helper y clases custom)
- `react-day-picker` 8 → **10** (API rediseñada; afecta `Calendar` de shadcn y `DateField` wrapper)

Validación: smoke visual de `DateField`, pickers en Reservas/Cotizaciones + tests.

## Lote 5 — TypeScript 7 (major, riesgo alto — diferir)

- `typescript` 5.9 → **7.0**

TS 7 aún es muy reciente; nuestro toolchain (tsgo, vite, eslint) puede no estar listo. **Recomiendo NO actualizar en este sprint** y esperar a que el ecosistema se estabilice.

## Orden de ejecución

1. Lote 1 (10 min)
2. Lote 2 (30 min)
3. Lote 3 (20 min)
4. Lote 4 (45 min — mayor esfuerzo por react-day-picker)
5. Cada lote: cambios → `bun run lint` + `tsgo` + `bunx vitest run` + changelog patch/minor

## Detalle técnico

- `react-day-picker@10` cambia props (`mode`, `selected`, `onSelect` similares, pero elimina classNames legacy). Habrá que ajustar `src/components/ui/calendar.tsx`.
- `tailwind-merge@3` requiere Tailwind ≥ 3.3; con Tailwind v4 debería funcionar directo, pero validar clases arbitrarias tokenizadas (`[var(--...)]`).
- `eslint-plugin-react-hooks@7` incluye reglas del React Compiler; puede levantar warnings nuevos.

## Fuera de alcance

- Migrar a TS 7 (Lote 5).
- Reintentar `jsdom` >26 (bloqueado por react-pdf).

## Pregunta

¿Ejecuto los 4 lotes seguidos en una sola sesión, o prefieres aprobar/validar lote por lote? ejecuta los 4
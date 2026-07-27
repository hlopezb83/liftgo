# Dependency Review — ERP LiftGo

Corrí `npm-check-updates` sobre `package.json` (v7.237.3) para tener el diff real. A continuación clasifico cada actualización por **riesgo** y recomiendo qué mover en este sprint.

**Analogía:** Piensa en las dependencias como refacciones del montacargas. Parches = cambio de aceite (rutina). Minor = filtro nuevo compatible. Major = motor nuevo (requiere pruebas de banco).

---

## Tier 1 — Seguros (aplicar en un solo PR)

Todos son **patches** sin cambios de API. Riesgo mínimo, valor alto (bugfixes y CVEs menores).

- **Radix UI (17 paquetes)** de `1.x` → misma minor: `accordion, alert-dialog, checkbox, collapsible, dialog, dropdown-menu, label, popover, scroll-area, select, separator, slot, switch, tabs, toggle, toggle-group, tooltip`. Todas son bugfixes de accesibilidad y focus management.
- **@supabase/supabase-js** `2.110.2 → 2.110.9`
- **TanStack Query stack** (`react-query`, `devtools`, `persist-client`, `sync-storage-persister`) `5.101.2 → 5.101.4`
- **@tanstack/react-virtual** `3.14.5 → 3.14.8`
- **Vite** `8.1.4 → 8.1.5`, **@vitejs/plugin-react** `6.0.3 → 6.0.4`
- **postcss** `8.5.17 → 8.5.23`
- **marked** `18.0.6 → 18.0.7`
- **lovable-tagger** `1.3.1 → 1.3.3`

**Validación:** `bun install && bun run typecheck && bun run lint && bun run test && bunx playwright test --shard=1/2`.

---

## Tier 2 — Minors con revisión de changelog (segundo PR)

- **@hookform/resolvers** `5.0 → 5.5.7` — salto grande dentro de 5.x; revisar breaking notes de `zodResolver`.
- **react-hook-form** `7.81 → 7.83`
- **zod** `4.0 → 4.4.3` — revisar `.refine`/`.superRefine` que usamos en Bookings/Returns.
- **react-router** `8.2 → 8.3` — sin cambios en la Data API que usamos.
- **date-fns** `4.1 → 4.4` — verificar `formatMonthEs.ts` y `nowMty()`.
- **recharts** `3.9 → 3.10` — repasar dashboard/cash-flow chart visualmente.
- **@sentry/react** `10.67 → 10.68`
- **lucide-react** `1.24 → 1.27` — usamos wrapper `Icon`, riesgo bajo.
- **Dev tools:** `@playwright/test 1.61→1.62`, `eslint-plugin-playwright`, `happy-dom`, `knip`, `typescript-eslint`.

**Validación:** los mismos comandos + suite E2E visual completa (Tier 2 puede alterar layouts).

---

## Tier 3 — Majors (NO recomiendo hacerlo hoy)

- **react-dropzone** `16 → 19` — acabamos de migrar a v16 hace pocas versiones; v17/18/19 cambiaron API de `useDropzone` y validación. Requiere sprint dedicado como el que hicimos para v16.
- **jsdom** `26 → 30` — usamos happy-dom mayoritariamente, pero algunos tests dependen de jsdom. Cambios de ESM y Node API.
- **@testing-library/jest-dom** `6 → 7` — drop de matchers legacy; toca revisar todos los `.toHaveClass`/`.toBeVisible`.
- **@types/node** `24 → 26` — esperar a que Node 26 sea LTS.
- **typescript** `5.9 → 7.0` — v7 elimina flags y cambia `moduleResolution`. Sprint dedicado con checkeo de todo el árbol de tipos generado por Supabase.

**Recomendación:** dejar los majors para un sprint técnico separado, uno por PR, con su propia validación E2E.

---

## Plan de ejecución propuesto (cuando pases a build mode)

1. **PR #1 (v7.238.0 minor):** Tier 1 completo — parches. Corre lint/typecheck/tests/E2E shard 1.
2. **PR #2 (v7.239.0 minor):** Tier 2 minors. Corre suite completa + visual.
3. **Backlog:** un issue por cada major del Tier 3.

Actualizar `public/changelog.json` + `public/changelog/v7.238.0.json` (y v7.239.0.json) como último paso de cada PR.

---

## Notas técnicas

- No hay CVEs high/critical activos según nuestro último `dependency_scan` (jsPDF sigue anclado a 4.0.0 por regla de proyecto — no aparece en la lista porque no está en `package.json` top-level).
- React 19 y Tailwind 4 ya están en la última minor pinneada por caret; no hay drift.
- `overrides.zod-validation-error: ^4.0.2` sigue vigente.

¿Ejecuto solo Tier 1, Tier 1+2, o quieres que también programe uno de los majors del Tier 3?
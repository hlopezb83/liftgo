# Auditoría de Dependencias — LiftGo

Nota: éste es el **reporte de auditoría** solicitado. No implica cambios de código; al final propongo acciones opcionales que puedes aprobar por lote.

## 1) Estado general

- **41 dependencias runtime** + **39 devDependencies**.
- Todas las libs mayores están en la **última versión estable disponible en npm** al día de hoy (React 19.2.7, Vite 8.1.4, Tailwind 4.3.2, react-router 8.2.0, Zod 4.4.3, TanStack Query 5.101.2, date-fns 4.4.0, react-day-picker 10.0.1, ESLint 10.7.0, Vitest 4.1.10, @sentry/react 10.65.0).
- Deuda pendiente detectada: **3 paquetes con minor/patch atrasado** y **2 candidatos a retirar**.

```text
Paquete                Actual     Última     Δ
@hookform/resolvers    5.0.0      5.4.0      minor
tailwind-merge         3.0.x      3.6.0      minor
zod                    4.0.0      4.4.3      minor
date-fns               4.1.0      4.4.0      minor
react-dropzone         15.0.0     16.0.0     MAJOR (breaking)
lucide-react           1.24.0     (alias)    revisar (versión inusualmente baja)
```

## 2) Propósito y justificación por dependencia

### Núcleo React / Routing / State


| Paquete                                                                 | Para qué sirve                | ¿Por qué la usamos?                  | ¿Reemplazo mejor?                                   |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------ | --------------------------------------------------- |
| `react`, `react-dom` 19                                                 | Runtime UI                    | Base del stack                       | No                                                  |
| `react-router` 8                                                        | Data router, lazy routes      | Rutas + `errorElement` + guards      | No; TanStack Router sería un rewrite grande sin ROI |
| `@tanstack/react-query` v5                                              | Cache/servidor-estado         | 100+ hooks vía `defineEntityQueries` | No                                                  |
| `@tanstack/query-sync-storage-persister` + `react-query-persist-client` | Persistencia offline de cache | Cold start rápido                    | No                                                  |
| `react-hook-form` + `@hookform/resolvers`                               | Forms + Zod                   | RHF + `FormDialog` en todo dialogs   | No                                                  |
| `zod` v4                                                                | Schemas y validación          | Fuente de verdad de tipos            | No                                                  |


### UI / Estilos


| Paquete                                                                                  | Uso                         | Reemplazo mejor                                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@radix-ui/*` (18 primitivos)                                                            | Base accesible de shadcn    | No; estándar de facto                                                                                                                   |
| `class-variance-authority`, `clsx`, `tailwind-merge`                                     | `cn()` + variantes          | No                                                                                                                                      |
| `tailwindcss` v4 + `@tailwindcss/postcss` + `@tailwindcss/typography` + `tw-animate-css` | Styling                     | No                                                                                                                                      |
| `lucide-react` **1.24.0**                                                                | Iconos                      | ⚠️ Versión sospechosamente antigua. Verificar si es alias/pin; **la última pública es 0.x** (semver invertido) — investigar y realinear |
| `cmdk`                                                                                   | Command palette (Ctrl+K)    | No                                                                                                                                      |
| `sonner`                                                                                 | Toasts globales             | No                                                                                                                                      |
| `next-themes`                                                                            | Dark mode                   | Podríamos migrar a un hook propio de 20 LOC; ROI bajo, no vale la pena                                                                  |
| `react-day-picker` v10                                                                   | Date picker                 | No                                                                                                                                      |
| `@hello-pangea/dnd`                                                                      | Kanban (mantenimiento, CRM) | Alternativa moderna: `@dnd-kit/core` (más chico, mantenido activamente). **Candidato a migración**, requiere reescribir 2-3 tableros    |


### Datos / Tablas / PDF / Export


| Paquete                    | Uso                                      | Reemplazo                                                            |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `@tanstack/react-table` v8 | Tablas                                   | No                                                                   |
| `@tanstack/react-virtual`  | Virtualización                           | No                                                                   |
| `@react-pdf/renderer`      | PDFs (facturas, cotizaciones, contratos) | No; ya centralizado en `src/lib/pdf/renderAndSave.tsx`               |
| `@e965/xlsx`               | Export XLSX                              | Fork mantenido de SheetJS; correcto                                  |
| `papaparse`                | Import/parse CSV                         | Estándar                                                             |
| `recharts` v3              | Charts                                   | Alternativas: `visx`, `echarts-for-react`. No hay razón para cambiar |
| `html-to-image`            | Screenshots DOM (share)                  | `dom-to-image-more` es alternativa; sin ganancia clara               |


### Utilidades


| Paquete                                 | Uso                                | Reemplazo                                                                                                                                                              |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date-fns` + `date-fns-tz`              | Fechas + zona horaria              | No; ya centralizado en `dateFormats.ts`                                                                                                                                |
| `currency.js`                           | Aritmética monetaria               | **Candidato a retiro**: ya tenemos `src/lib/money/index.ts` con toda la lógica MXN. Verificar si sólo se usa como dependencia transitiva o si aún hay imports directos |
| `marked`                                | Render de changelog/manual         | No; reemplazó a `react-markdown`                                                                                                                                       |
| `dompurify`                             | Sanitización HTML del `marked`     | Sí, obligatorio                                                                                                                                                        |
| `react-dropzone` v15                    | Uploads (CsfDropzone, imágenes)    | v16 disponible (breaking)                                                                                                                                              |
| `react-hotkeys-hook`                    | Shortcuts                          | Reemplazó nuestro `useHotkeys` propio                                                                                                                                  |
| `@medv/finder`                          | Selector CSS único para telemetría | Muy nicho pero muy pequeño                                                                                                                                             |
| `@supabase/supabase-js`                 | Cliente backend                    | No                                                                                                                                                                     |
| `@sentry/react` + `@sentry/vite-plugin` | Errores + sourcemaps               | No                                                                                                                                                                     |


### Dev / Tooling

Todo alineado con última versión. `knip` sigue siendo útil para detectar código muerto tras cada sprint.

## 3) Código custom candidato a migrar a dependencias

Analicé `src/lib/**` y `src/hooks/**`. La app ya está fuertemente apoyada en npm; los siguientes son los **únicos casos con ROI positivo**:


| Custom actual                                     | Alternativa npm                                                     | Recomendación                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/exportCsv.ts`                            | `papaparse` (ya instalada) también hace **stringify**               | 🟢 Migrar: eliminar helper propio y usar `Papa.unparse` — ~40-60 LOC menos                              |
| `src/hooks/usePullToRefresh.ts`                   | `use-pull-to-refresh` (npm, 1.5kb)                                  | 🟡 Opcional; nuestro hook es simple, ROI bajo                                                           |
| `src/hooks/useDebouncedValue.ts`                  | `use-debounce`                                                      | 🔴 No migrar; 8 LOC bien tipadas                                                                        |
| `src/hooks/useIsMounted.ts`                       | Nativo con React 19 (`useSyncExternalStore` o simplemente evitarlo) | 🟡 Auditar si aún es necesario en React 19; posible borrado                                             |
| `src/lib/shortcuts/*`                             | `react-hotkeys-hook` (ya instalada)                                 | 🟡 Verificar que no queden atajos manuales fuera de la lib                                              |
| `src/lib/format/formatMonthEs.ts`                 | `date-fns/format` con `locale: es`                                  | 🔴 Mantener; encapsula regla de negocio (mayúsculas, sin "de")                                          |
| `src/lib/money/index.ts`                          | `currency.js` (ya instalada) o `dinero.js` v2                       | 🟡 Decisión: **o** consolidamos todo en `currency.js` **o** retiramos `currency.js`. Hoy conviven ambos |
| `src/lib/pdf/renderAndSave.tsx` (saveBlob nativo) | `file-saver`                                                        | 🔴 Ya lo retiramos a propósito, mantener                                                                |
| `src/hooks/useNavigateTransition.ts`              | `useTransition` de React 19 + `startTransition`                     | 🟡 Revisar si sigue aportando                                                                           |
| `src/lib/query/createEntityKeys.ts`               | `@tanstack/query-key-factory`                                       | 🔴 Nuestro helper es superior (tipado + convenciones internas)                                          |


### Anti-patrón detectado

- `**currency.js` + `src/lib/money/` en paralelo**: duplicación silenciosa. O uno o el otro.
- `**lucide-react@1.24.0**`: versión anómala. El paquete oficial va en `0.x` (semver invertido). Podría ser un alias local o un typo de pin — vale la pena confirmar el `lockfile`.

## 4) Sin acción recomendada

No hay razón para reemplazar: Radix, TanStack Query/Table/Virtual, react-hook-form, Zod, Tailwind, date-fns, @react-pdf/renderer, @supabase/supabase-js, Sentry, Vite, Vitest, sonner, cmdk, react-day-picker, recharts.

## 5) Acciones propuestas (te las puedo ejecutar por lote si apruebas)

- **Lote A — Higiene de versiones (minor/patch, sin breaking)**: `@hookform/resolvers` 5.4, `zod` 4.4.3, `date-fns` 4.4, `tailwind-merge` 3.6.
- **Lote B — Confirmar `lucide-react**`: verificar el pin real vs. `lucide-react` oficial y realinear si aplica. [https://github.com/lucide-icons/lucide/releases](https://github.com/lucide-icons/lucide/releases)
- **Lote C — Retirar duplicados**: decidir entre `currency.js` y `src/lib/money`; eliminar el perdedor (~150 LOC o 1 dependencia menos). Usar dependencia, asegurar que es compatible con mexico. 
- **Lote D — `papaparse.unparse` en `exportCsv.ts**`: -40/60 LOC.
- **Lote E — Evaluación `react-dropzone` v16**: cambelog de breaking + migrar `CsfDropzone` y `DragDropImageUploader`.
- **Lote F — (Grande) Migración** `@hello-pangea/dnd` **→** `@dnd-kit`: sólo si buscamos DX/perf; requiere reescribir Kanban de mantenimiento y CRM. Cambiamos a DND Kit

Confirma qué lotes quieres que ejecute y arranco por el A.
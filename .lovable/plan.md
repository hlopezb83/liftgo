# Auditoría: código custom reemplazable por dependencias

## Resumen ejecutivo

La base está **bien alineada** con las dependencias instaladas. Ya se apoya correctamente en:

- **Fechas** → `date-fns` + `date-fns-tz` (`src/lib/utils.ts`, `src/lib/format/dateFormats.ts`)
- **Dinero** → `currency.js` (`src/lib/money/index.ts`)
- **CSV** → `papaparse` (`src/lib/exportCsv.ts`)
- **Markdown + sanitización** → `marked` + `dompurify` (`src/features/help/lib/markdown.ts`)
- **Tablas + virtualización** → `@tanstack/react-table` + `@tanstack/react-virtual` (`src/components/dataTable/v2/*`)
- **Persistencia de cache** → `@tanstack/query-sync-storage-persister`
- **PDFs** → `@react-pdf/renderer` en todo `src/lib/pdf/*`

**Conclusión:** el margen real de reemplazo es pequeño y se concentra en hooks utilitarios y un helper de clipboard. No hay virtualización, paginación, retry/backoff, slugify, deep-equal, uuid ni focus-trap reinventados.

## Hallazgos priorizados

Ordenados por (Impacto desc, Complejidad asc).


| #   | Archivo                                               | Custom                                                                                    | Reemplazo                                                                                                                  | Impacto | Complejidad |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ----------- |
| 1   | `src/hooks/useListFilters.ts:78-98`                   | Filtrado manual de listas por búsqueda/status en paralelo a `DataTableV2`                 | `@tanstack/react-table` (`globalFilter` / `columnFilters`) — **ya instalada**                                              | Medio   | Alta        |
| 2   | `src/hooks/use-mobile.tsx:5-27`                       | `useMatchMedia` / `useIsMobile` / `useIsTabletOrBelow` con `matchMedia` + listener manual | `usehooks-ts` `useMediaQuery` — **añadir dependencia**                                                                     | Medio   | Baja        |
| 3   | `src/hooks/useKeySequence.ts` + `src/lib/shortcuts/*` | Secuencias multi-tecla (`g d`) con `keydown` manual                                       | `react-hotkeys-hook` v5 soporta secuencias — **ya instalada**. Requiere verificar API `useHotkeys("g>d")` antes de migrar. | Medio   | Baja/Media  |
| 4   | `src/hooks/usePullToRefresh.ts`                       | Pull-to-refresh táctil manual (touchstart/move/end)                                       | `react-simple-pull-to-refresh` — **no instalada**; solo si se acepta nueva dep                                             | Medio   | Media       |
| 5   | `src/hooks/useDebouncedValue.ts:7-14`                 | Debounce con `useState` + `setTimeout`                                                    | `usehooks-ts` `useDebounce` — **añadir dependencia**                                                                       | Bajo    | Baja        |
| 6   | `src/components/ui/ErrorDetailsDialog.tsx:13-39`      | `copyToClipboard` con fallback manual `execCommand` + `<textarea>`                        | `usehooks-ts` `useCopyToClipboard`                                                                                         | Bajo    | Baja        |
| 7   | `src/lib/ui/errorReport.ts:54-59`                     | `safeUuid()` fallback manual sobre `crypto.randomUUID`                                    | Simplificar (no requiere dependencia)                                                                                      | Bajo    | Baja        |


## Recomendación de sprint

Propongo agrupar por impacto y complejidad. **Este es solo el reporte** — dime cuáles autorizas para ejecutar en un sprint posterior:

- **Lote G1 (rápido, alto ROI):** instalar `usehooks-ts` y migrar hallazgos #2, #5, #6. ~1 dependencia nueva, elimina 3 hooks caseros y un helper con fallback frágil.
- **Lote G2 (verificación previa):** revisar API de secuencias en `react-hotkeys-hook@5.3.3` (hallazgo #3). Si soporta `g>d`, migrar `useKeySequence` y consolidar en una sola librería de atajos.
- **Lote G3 (mayor esfuerzo):** migrar `useListFilters` a `globalFilter`/`columnFilters` de `@tanstack/react-table` (hallazgo #1). Requiere tocar cada call-site y mantener el sync a `searchParams`/`sessionStorage`.
- **Descartar / opcional:** #4 (pull-to-refresh) solo si se acepta dependencia nueva; #7 puede simplemente simplificarse sin migración.

## Notas técnicas

- No se detectó uso de `file-saver`, comparadores locale custom fuera de `dataTable/v2/sorting.ts` (que usa `localeCompare` correctamente), ni generación PDF ad hoc.
- Zonas ya óptimas que **no** requieren cambios: fechas, dinero, CSV, markdown, tablas, virtualización, PDFs, query cache.
- Ninguna acción se ejecuta hasta que aprueben el sprint correspondiente.

Implementamos los 7 hallazgos
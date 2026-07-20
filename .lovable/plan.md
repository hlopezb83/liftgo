# Auditoría Ola 3.a (v7.114.4)

**Estado: verde ✅**
- 0 errores de ESLint, 1083/1083 tests pasando
- Warnings: 72 → 47 (−25)
- Cambios revisados: `useTableFilters` (deja de usar refs y lee `values`/`facets` desde el closure invalidado por `filterKey`), `ChangelogPage` + `RecurringInvoicesPreviewDialog` migran prev-prop guard de `useRef` a `useState`, `DataTableBodyV2` memoiza `armPrefetch`/`disarmPrefetch` con `useCallback`.
- Riesgo controlado: el patrón `values`/`facets` en closure ya es la forma canónica de React 19 + Compiler (el memo se recomputa cuando cambia el primitivo derivado). No hay regresión en filtros de tablas — la suite de filtros pasa.
- Cobertura de tests: los 3 archivos tocados no tenían tests unitarios dedicados (son componentes de UI con lógica declarativa mínima). El comportamiento observable está cubierto indirectamente por los E2E de filtros/tablas y el suite de smoke. No amerita nuevos tests unitarios.

# Distribución de los 47 warnings restantes

| Regla                                 | Warnings |
|--------------------------------------|---------:|
| `react-hooks/set-state-in-effect`    | 14       |
| `react-refresh/only-export-components` | 9      |
| `react-hooks/incompatible-library`   | 6        |
| `max-lines-per-function`             | 6        |
| `complexity`                          | 6        |
| `react-compiler/react-compiler`      | 2        |
| `no-restricted-imports`               | 2        |
| resto (refs, purity, static-components, max-lines, import-x/order) | 6 |

# Fase propuesta — Ola 3.b: `set-state-in-effect` restantes (14)

Bucket con mejor relación impacto/riesgo. El patrón ya está validado en Ola 2 (prev-prop guard con `useState` o derivación con `useMemo`).

## Alcance
1. Localizar los 14 sitios (`bun run lint | rg set-state-in-effect`).
2. Clasificar cada uno:
   - **Sincronizar estado con prop cambiante** → prev-prop guard con `useState`.
   - **Valor derivable** → `useMemo` en render.
   - **Reset al abrir modal** → guard sobre `open` con `useState` prev.
   - **Casos legítimos** (subscripciones async, timers) → mantener con justificación puntual + `eslint-disable-next-line` con comentario.
3. Aplicar el refactor archivo por archivo, corriendo `bun run lint` incremental para confirmar bajada de warnings.
4. Correr `bunx vitest run` al cierre para asegurar 1083/1083.
5. Documentar en `public/changelog.json` como `v7.114.5` (patch).

## Criterio de éxito
- 0 errores, 47 → ≤ 33 warnings.
- 1083 tests siguen en verde.
- Sin cambios de comportamiento en UI (prev-prop guard es semánticamente equivalente al `useEffect`+`setState` original).

## Fuera de alcance (para olas posteriores)
- Ola 3.c: `only-export-components` (9) — mover constantes/utils fuera de archivos de componentes.
- Ola 3.d: `incompatible-library` (6), `complexity`/`max-lines-per-function` (12), y colas finales.

# Notas técnicas
- `useState` como prev-prop guard es el patrón oficial documentado en https://react.dev/reference/react/useState#storing-information-from-previous-renders — más seguro que `useRef` porque no dispara la regla `react-hooks/refs`.
- En dialogs con múltiples resets, un solo guard sobre `open` basta; no encadenar múltiples `useState` prev.
- Cuando el estado deriva de una prop sin necesidad de historia, priorizar `useMemo` antes que el guard (elimina la variable prev completamente).

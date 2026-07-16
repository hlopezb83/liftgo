## Análisis de los logs de CI

Corrí los 12 jobs del pipeline. Estado real:

| Job | Resultado |
|---|---|
| Typecheck (tsc) | verde |
| Build (Vite) | verde |
| Vitest + Coverage | verde |
| RLS contract tests | verde |
| Edge Functions (Deno fmt/lint/test) | verde |
| Knip | verde |
| Secrets check | verde |
| Actionlint | verde |
| ESLint | verde (0 errores, 163 warnings) |
| E2E shard 2/2 | verde |
| **E2E shard 1/2** | **falla** |
| CI success (gate) | rojo por consecuencia |

Un solo test tumbó el pipeline: `tests/e2e/filters-invoices.spec.ts:26` — "Facturas — filtros StatusTabs · alterna entre estados sin congelarse (regresión v7.62.2)". Falla en corrida original y en retry #1 con el mismo error, dentro del **primer click** del bucle (tab "Sin Pagar"):

```
Locator:  getByRole('tab', { name: /sin pagar/i }).first()
Expected: "active"     (data-state esperado por Radix)
Received: ""            (atributo vacío)
   at tests/e2e/filters-invoices.spec.ts:52:30
```

No es flake: fallan las 2 corridas y en ambas se agota el timeout de 30 s. El resto de la suite (36 tests) pasa, incluyendo `smoke-nav /invoices`, o sea la ruta carga bien; lo que rompe es específicamente el ciclo de alternado post-refactor de v7.72.2 en este spec.

## Hipótesis del fallo

El test ya se endureció en v7.72.2: cambió `waitForLoadState("networkidle")` por un `waitForResponse(/rest\/v1\/invoices/)`. Cuando el tab "Sin Pagar" está *inactivo* al inicio y hacemos click, Radix debería moverlo a `data-state="active"`. Que llegue vacío ("") sugiere que la tabla congeló su render tras el primer refetch — exactamente el síntoma que el Proxy en `useLiftgoTable` (líneas 110-120) intentaba invalidar. Sospechas:

1. La `dataVersion = tableData.length` no cambia si los subsets `all` → `sent` devuelven el mismo largo, y `sortKey`/`selKey`/`pagKey` tampoco cambian → el `Proxy` conserva identidad → React Compiler memoiza → tab queda visualmente sin cambio de estado.
2. `useTableFilters` reescribe la URL y dispara refetch, pero el `data-state` de Radix se controla desde el `value` del `<Tabs>`. Si el `statusFilter` se hidrata desde `URLSearchParams` con un pequeño retraso, el primer click actualiza URL, pero el `value` prop del `<Tabs>` no re-lee a tiempo → `data-state=""`.
3. Cambio reciente en `src/components/ui/calendar.tsx` (v7.72.5) no afecta directamente, pero convive con el `DateRangePickerField` del toolbar.

Cualquiera de las tres se puede confirmar reproduciendo localmente con Playwright headed en `/invoices`.

## Alcance propuesto

Objetivo único: **poner el pipeline en verde** arreglando la regresión real, no silenciando el test.

### Sprint L.1 — Diagnóstico dirigido (chat de build, sin cambios de código todavía)
1. Levantar la app localmente y correr el spec en headed mode con `PWDEBUG=1` para inspeccionar por qué el primer click al tab "Sin Pagar" no promueve `data-state=active`.
2. Loggear en `useLiftgoTable` los valores de `dataVersion`, `sortKey`, `selKey`, `pagKey` entre clicks y verificar que el `Proxy` sí cambia identidad.
3. Confirmar que `<Tabs value={statusFilter}>` en `FiltersToolbar.StatusTabs` recibe el nuevo `statusFilter` inmediatamente tras `setStatusFilter`.

### Sprint L.2 — Fix
Según lo que muestre el diagnóstico:

- **Si el problema es la identidad del `Proxy`**: incluir un `Symbol` incremental como dep del `useMemo` (o un `useRef` counter que aumenta cuando cambia `data` o `state.globalFilter`) para forzar identidad sin depender de `dataVersion`.
- **Si es lag entre URL ↔ estado**: mover `statusFilter` a `useState` local con seed desde URL en mount, sincronizando la URL como side effect (patrón "URL is a mirror, not source of truth" para tabs) o forzar `flushSync` en el `onValueChange` del `Tabs`.
- **Si es orden de renders del `useTableFilters`**: exponer una versión "primitive" de `useTableFilters` que devuelva `[value, setValueSync]` sin depender de `URLSearchParams` para la lectura inmediata.

### Sprint L.3 — Verificación
1. Correr `bunx playwright test tests/e2e/filters-invoices.spec.ts --repeat-each=3` para confirmar que el test es estable sin retry.
2. Correr la suite completa `shard 1/2` para asegurar que no rompimos otra spec.
3. Actualizar `public/changelog.json` + `public/changelog/v7.72.6.json` (patch: "Fix regresión StatusTabs de facturas detectada en CI shard 1/2").

## Detalles técnicos

- Archivo del test: `tests/e2e/filters-invoices.spec.ts` (58 líneas, ya endurecido en v7.72.2).
- Componente en la mira: `src/components/dataTable/v2/useLiftgoTable.ts` línea 120 (`useMemo(() => new Proxy(table, {}), [table, dataVersion, sortKey, selKey, pagKey])`).
- Wrapper del toolbar: `src/features/invoices/components/list/InvoicesToolbar.tsx` → `FiltersToolbar.StatusTabs` en `src/components/filters/FiltersToolbar.tsx:74-99`.
- Los 163 warnings de ESLint **no bloquean CI** (fallan solo con `--max-warnings=0`, cosa que hoy no hacemos). Los dejo fuera de este plan; si quieres los abordamos en un sprint aparte.

## Fuera de alcance

- Cero cambios en RLS, edge functions, schema, PDFs, o day pickers (el fix de v7.72.5 se mantiene).
- No se tocan tests que ya pasan.
- No se sube el umbral de ESLint a `--max-warnings=0` en este sprint.

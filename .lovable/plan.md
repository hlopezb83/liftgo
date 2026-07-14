## Diagnóstico

En `/cuentas-por-pagar` los filtros funcionan en el preview pero no en la app publicada. El síntoma (la tabla no se actualiza al cambiar un filtro y muestra los mismos registros) apunta a una diferencia entre el build de dev y el de producción.

La causa más probable es el **React Compiler** (habilitado vía `babel-plugin-react-compiler` en `vite.config.ts`), que sólo despliega toda su auto‑memoización en el build de producción. El hook `useAccountsPayableFilters` está escrito con patrones que el compilador puede memoizar de forma incorrecta:

```ts
// src/features/accounts-payable/hooks/useAccountsPayableFilters.ts
const filtered = bills.filter((b) => matches(b, state));   // sin useMemo
const monthsSet = new Set<string>();                        // mutación local
for (const b of bills) monthsSet.add(...);
const availableMonths = Array.from(monthsSet).sort().reverse();
const set = <K extends keyof FilterState>(k, v) => setState(...); // sin useCallback
```

En dev cada render recomputa `filtered` con `state` fresco, así que "funciona". En producción, el compilador puede reutilizar el resultado memoizado sin detectar correctamente `state` como dependencia (el patrón de mutación de `monthsSet` + `filter` inline es un caso conocido de bail‑out silencioso). Resultado: `filtered` queda anclado a la primera captura de `state = INITIAL`.

Se ve claro comparándolo con `useListFilters` (que sí funciona en prod) — ese hook usa `useMemo`/`useCallback` explícitos con deps correctas.

## Cambio propuesto (sólo un archivo)

Refactorizar `src/features/accounts-payable/hooks/useAccountsPayableFilters.ts` para dejar todas las derivaciones detrás de hooks explícitos, sin cambiar la API pública (`filtered`, `availableMonths`, `set`, `reset`, `hasActive`, propiedades del estado):

- `filtered` → `useMemo(..., [bills, state])`
- `availableMonths` → `useMemo(..., [bills])`
- `hasActive` → `useMemo(..., [state])` con comparación por campo (no `JSON.stringify` en cada render)
- `set` → `useCallback(..., [])` (usa el updater functional de `setState`, no depende de nada externo)
- `reset` → `useCallback(..., [])`

Comportamiento y firma del hook se conservan al 100%, así que ni `CuentasPorPagarPage.tsx` ni `SupplierBillsFilters.tsx` necesitan tocarse.

## Verificación

1. `bun run build` para confirmar que compila en modo producción sin warnings del linter `react-compiler/react-compiler` sobre este hook.
2. Playwright contra `http://localhost:8080/cuentas-por-pagar`: aplicar búsqueda, estatus, proveedor, mes, categoría, aprobación y REP; screenshot en cada paso para confirmar que `filtered.length` y las filas cambian.
3. Publicar y validar en `liftgo.lovable.app` que los filtros ahora responden.

## Changelog

Última entrada: `public/changelog/v7.61.6.json`. Al terminar agrego `public/changelog/v7.61.7.json` (patch, categoría bugfix) y lo referencío en `public/changelog.json`, describiendo que el hook de filtros de cuentas por pagar era incompatible con React Compiler en producción.

## Fuera de alcance

- No toco `useListFilters` ni otros hooks de filtros — sólo el reportado.
- No cambio la UI de `SupplierBillsFilters`.
- No modifico `vite.config.ts` ni la configuración global del React Compiler.

## Cambios en módulo de Gastos Operativos

**Archivo:** `src/features/expenses/hooks/expenses/useExpenseFilters.ts`
1. Cambiar default de `filterMonth` de `currentMonth` a `"all"` (todos los meses).
2. Ampliar `matchesFilters` para que el `search` también busque en `e.suppliers?.name` además de `description` (case-insensitive, trim).

**Archivo:** `src/features/expenses/pages/OperatingExpensesPage.tsx`
3. Localizar nombres de mes a español en el `SelectItem` del filtro de mes: ya se usa `format(..., { locale: es })`, pero los valores actuales se ven en inglés. Verificar import de `es` desde `date-fns/locale` y aplicarlo también al label del `SelectValue` si hace falta (renderizar via render personalizado o asegurar que `availableMonths` se formatean con locale es). Confirmar que el `SelectTrigger` muestra el label localizado, no el valor crudo `yyyy-MM`.
4. Actualizar placeholder del `SearchBar` a `"Buscar por descripción o proveedor…"`.

**Changelog:** agregar entrada `6.25.5` (patch) en `public/changelog.json` + `public/changelog/v6.25.5.json` describiendo: default "todos los meses", búsqueda incluye proveedor, meses en español.

Sin cambios de BD ni lógica de negocio.
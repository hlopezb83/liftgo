
# Plan v6.3.1 — Refinamientos arquitectónicos restantes

Continuación de v6.3.0. Pasos 3-7 del audit original.

## Pasos

1. **Normalizar prefill hooks** — extraer mapeo de `line_items` duplicado entre `useQuotePrefill` (120 LOC) y `useInvoicePrefill` (120 LOC) a `src/lib/domain/lineItemsMapper.ts`. Ahorro ~40 LOC.

2. **Dividir `useCompanySettings`** (122 LOC) en `useCompanySettingsQuery` + `useCompanySettingsMutations` siguiendo patrón establecido.

3. **Dividir `useQuoteBookingCreator`** (119 LOC): extraer helpers puros de construcción de booking a `quoteBookingBuilders.ts`.

4. **Dividir `quoteFormHelpers`** (126 LOC) por responsabilidad: cálculos vs validación vs defaults.

5. **Mover `NotFound.tsx`** de `src/pages/` a `src/features/system/pages/NotFound.tsx`. Actualizar import en router.

6. **Documentar reglas de tamaño** en `architecture.md` §19: ≤150 LOC componentes, ≤80 LOC hooks, criterios de excepción (tablas densas, PDFs, shadcn upstream).

7. **Changelog** — añadir entrada `6.3.1` (minor) a `public/changelog.json` y crear `public/changelog/v6.3.1.json`.

## Verificación

- `npx eslint src` → 0 warnings
- `bunx vitest run` → 48/48 PASS
- `npx knip` → 0 dead exports

## Diferidos (no en este plan)

- Barrels públicos `src/features/<x>/index.ts` (v6.2 futura, requiere decisión de API pública por feature).
- 21 hooks restantes 80-119 LOC: aceptados como dentro de tolerancia tras documentar excepciones.

## Riesgo

Muy bajo. Todo es refactor mecánico siguiendo patrones ya aplicados en 7 olas previas. Sin cambios funcionales ni de BD.

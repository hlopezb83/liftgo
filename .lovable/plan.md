## Reducir excepciones §19 — Ola D

9 archivos llevan `// arch:excepción §19`. Tras analizar cada uno, **todos son reducibles** sin cambios funcionales: 7 son splits triviales (mismas exports, sólo se mueven a archivos por entidad), 2 son extracciones de sub-componente.

### Plan por archivo

**1. `src/features/expenses/hooks/useOperatingExpenseMutations.ts` (89 LOC, 4 mutaciones)**
→ Convertir en carpeta `useOperatingExpenseMutations/` con un archivo por hook (~25 LOC c/u) + `index.ts` que reexporta. Sin cambios en imports externos (la carpeta resuelve por `index.ts`).

**2. `src/features/users/hooks/users/useUserAdminMutations.ts` (84 LOC, 4 mutaciones)**
→ Mismo patrón: carpeta + 4 archivos (`useInviteUser.ts`, `useDeleteUser.ts`, `useResetPassword.ts`, `useToggleStatus.ts`) + `index.ts`.

**3. `src/features/customers/components/customers/CustomerFormSections.tsx` (183 LOC, 4 secciones)**
→ Splitear en 4 archivos junto al actual + helper compartido para `SectionHeading`:
- `customerSections/SectionHeading.tsx` (~6 LOC)
- `customerSections/IdentitySection.tsx` (~20 LOC)
- `customerSections/FiscalSection.tsx` (~95 LOC)
- `customerSections/ContactSection.tsx` (~25 LOC)
- `customerSections/AddressNotesSection.tsx` (~18 LOC)
- `CustomerFormSections.tsx` se vuelve barrel (re-exports + `export { Form }`).

**4. `src/features/audit/components/auditTrail/auditTrailConstants.tsx` (160 LOC)**
→ Trocear por responsabilidad:
- `auditTrailLabels.ts` — `TABLES`, `ACTION_LABELS`, `TABLE_LABELS`, `FIELD_LABELS`, `translateField/Action/Table`, `formatTimestamp` (~80 LOC).
- `auditTrailValueFormatters.ts` — `formatAuditValue`, `formatDateString`, `formatStringValue`, sets `CURRENCY_FIELDS`/`DATETIME_FIELDS`/`DATE_ONLY_FIELDS`/`ENUM_LABEL_FIELDS`, `HIDDEN_DIFF_FIELDS`, `getRecordLabel` (~70 LOC).
- `auditTrailIcons.tsx` — `actionIcon`, `actionBadgeVariant` (~20 LOC).
- `auditTrailConstants.tsx` queda como barrel para no romper consumidores.

**5. `src/features/quotes/components/quotes/SaleLineItems.tsx` (153 LOC)**
→ Extraer `SaleLineRow` (la fila editable) a `SaleLineRow.tsx` (~85 LOC). `SaleLineItems.tsx` queda <70 LOC.

**6. `src/features/quotes/components/quotes/RentalLineItems.tsx` (158 LOC)**
→ Extraer `RentalLineRow` a `RentalLineRow.tsx` (~95 LOC). `RentalLineItems.tsx` queda <65 LOC.

**7. `src/features/reports/components/reports/IncomeStatementTable.tsx` (190 LOC)**
→ Ya tiene `ComparisonTable` y `StatementTableRow` internos: extraerlos a archivos hermanos.
- `incomeStatement/ComparisonTable.tsx` (~40 LOC)
- `incomeStatement/StatementTableRow.tsx` (~50 LOC)
- `incomeStatement/incomeStatementHelpers.ts` — `formatCell`, `formatRowDelta`, `cellColor`, `getBreakdownFor` (~25 LOC).
- `IncomeStatementTable.tsx` orquesta (~60 LOC).

**8. `src/features/reports/components/reports/ProfitabilityByModelReport.tsx` (199 LOC)**
→ Extraer:
- `profitabilityByModel/profitabilityHelpers.ts` — `inRange`, `buildModelUnitsMap`, `buildRevenueMap`, `buildCostMap`, `aggregateRows`, tipos `ModelRow` y `Forklift/Booking/Invoice/MaintLog/DamageRec` (~75 LOC).
- `profitabilityByModel/ProfitabilityChart.tsx` — el `BarChart` recharts (~40 LOC).
- `profitabilityByModel/profitabilityColumns.tsx` — definición `ColumnDef<ModelRow>[]` (~30 LOC).
- Componente principal queda <80 LOC.

**9. `src/features/reports/components/reports/UtilizationByModelReport.tsx` (155 LOC)**
→ Extraer:
- `utilizationByModel/utilizationHelpers.ts` — agregación + `EXCLUDED_STATUSES` + `getUtilColor` + tipo `ModelRow` (~50 LOC).
- `utilizationByModel/utilizationColumns.tsx` — columnas (~30 LOC).
- `utilizationByModel/UtilizationChart.tsx` — chart (~30 LOC).
- Componente principal <75 LOC.

### Verificación
- Sin cambios de comportamiento ni de UI.
- Imports externos preservados gracias a barrels en los 4 archivos que tienen consumidores (`CustomerFormSections`, `auditTrailConstants`, `SaleLineItems`, `RentalLineItems`).
- `bunx knip --no-progress` → 0 dead exports.
- Eliminar los 9 marcadores `// arch:excepción §19`.

### Changelog
- `public/changelog/v6.7.5.json` (patch): "Eliminadas las 9 excepciones §19 — splits por entidad/responsabilidad".
- Actualizar `public/changelog.json` al inicio del array.

### Fuera de alcance
- Sin cambios en lógica de negocio, RPCs, RLS, ni rendering.
- Sin cambios en firmas públicas (mismas exports en mismos paths).

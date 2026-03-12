

## Agregar toggle base devengada / flujo de efectivo

### Cambios

**1. `src/components/reports/IncomeStatementReport.tsx`**
- Agregar prop `accountingBasis: "accrual" | "cash"` a la interfaz `Props`
- En el `useMemo` de `data` (líneas 129-141), condicionar el filtro de facturas:
  - **Accrual**: status !== draft/cancelled, fecha = `issued_at` (como está ahora)
  - **Cash**: status === "paid" && paid_at, fecha = `paid_at`

**2. `src/pages/IncomeStatementPage.tsx`**
- Agregar estado `accountingBasis` con valor default `"accrual"`
- Agregar un toggle con `Switch` + label ("Devengado" / "Flujo de efectivo") junto a los selectores de mes
- Pasar `accountingBasis` como prop al componente `IncomeStatementReport`

**3. `src/lib/changelog.ts`** — Registrar v3.38.0


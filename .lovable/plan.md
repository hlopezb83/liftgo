

## Plan: Costo de Venta de Montacargas

### Concepto

Agregar un campo `acquisition_cost` (costo de adquisición) a la tabla `forklifts` y una nueva categoría de gasto operativo `costo_venta`. Cuando el status de un montacargas cambie a "Vendido", se genera automáticamente un gasto operativo con categoría `costo_venta` usando el costo de adquisición registrado.

### Cambios

1. **Migración DB** (2 cambios):
   - Agregar columna `acquisition_cost numeric default 0` a `forklifts`
   - Agregar valor `costo_venta` al enum `expense_category` (usado por `operating_expenses.category`)

2. **`src/lib/formSchemas.ts`** — Agregar `acquisition_cost` al schema del montacargas

3. **`src/pages/ForkliftForm.tsx`** — Agregar campo "Costo de adquisición" en la sección financiera (junto a tarifas)

4. **`src/components/forklift-detail/ForkliftSpecsCard.tsx`** — Mostrar costo de adquisición en las especificaciones

5. **`src/hooks/useForklifts.ts`** — En `useUpdateStatus`, cuando `toStatus === 'sold'`, consultar el `acquisition_cost` del montacargas y crear automáticamente un registro en `operating_expenses` con categoría `costo_venta`

6. **`src/hooks/useOperatingExpenses.ts`** — Agregar `costo_venta` al tipo `ExpenseCategory` y a `EXPENSE_CATEGORY_LABELS`

7. **`src/components/reports/IncomeStatementReport.tsx`** — Agregar fila "(-) Costo de Venta" como costo directo (junto a mantenimiento y daños, antes de Utilidad Bruta)

8. **`src/pages/OperatingExpensesPage.tsx`** — Soportar la nueva categoría en el formulario y tabla

9. **`src/lib/changelog.ts`** — v3.16.0

### Flujo automático

```text
Cambiar status → "Vendido"
       ↓
Consultar acquisition_cost del montacargas
       ↓
Insertar en operating_expenses:
  - category: "costo_venta"
  - description: "Costo de venta: {nombre montacargas}"
  - amount: acquisition_cost
  - expense_date: hoy
```

### Estado de Resultados actualizado

```text
Ingresos
(-) Mantenimiento
(-) Daños
(-) Costo de Venta     ← NUEVO
= Utilidad Bruta
(-) Renta
(-) Nómina
...
= Utilidad Neta
```


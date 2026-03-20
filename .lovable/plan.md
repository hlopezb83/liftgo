

## Quitar "Software" y "Depreciación" del Estado de Resultados

### Cambio

**`src/components/reports/IncomeStatementReport.tsx`** — Línea 30:

Remover `"software"` y `"depreciacion"` del array `EXPENSE_CATEGORIES`:

```typescript
const EXPENSE_CATEGORIES: ExpenseCategory[] = ["renta", "nomina", "caja_chica", "publicidad", "otro"];
```

Esto elimina ambas líneas de la sección de gastos operativos. Los inicializadores con `software: 0` y `depreciacion: 0` pueden quedarse sin efecto visual (no se renderizan si no están en el array), pero opcionalmente se limpian también para consistencia.

### Archivos a modificar
- `src/components/reports/IncomeStatementReport.tsx` (1 edición principal)


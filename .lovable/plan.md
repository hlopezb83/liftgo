

# Fix: Incluir mes completo en "Hasta" del Estado de Resultados

## Problema
`new Date("2026-03-01")` se interpreta como UTC medianoche, que en zona horaria de México (UTC-6) se convierte en el 28 de febrero a las 6pm. Entonces `endOfMonth` calcula el fin de febrero en lugar de marzo. El mismo bug afecta `startDate`.

## Solución

### `src/pages/IncomeStatementPage.tsx`
- Cambiar la construcción de fechas para usar `new Date(year, monthIndex, 1)` en lugar de `new Date("yyyy-MM-01")`, evitando el parseo UTC:
  ```ts
  const [y, m] = startMonth.split("-").map(Number);
  const startDate = startOfMonth(new Date(y, m - 1, 1));
  const [y2, m2] = endMonth.split("-").map(Number);
  const endDate = endOfMonth(new Date(y2, m2 - 1, 1));
  ```

### `src/lib/changelog.ts`
- Entrada v3.22.2: corrección de bug en rango de fechas del Estado de Resultados


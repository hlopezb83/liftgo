## Contexto

El Estado de Resultados ya **muestra automáticamente** las 13 nuevas categorías porque itera `DIRECT_COST_CATEGORIES` (operativas, en Costo de Servicio) y `EXPENSE_CATEGORIES` (administrativas/comerciales/financieras, bajo Margen Bruto). Sin embargo, hoy todas aparecen como una lista plana de renglones `(-) <Categoría>` sin distinguir los bloques contables.

Este plan agrega **agrupación visual y subtotales por bloque** para que el P&L refleje la estructura contable solicitada.

## Estructura nueva del P&L

```text
  Ingresos por Rentas
  Ingresos por Ventas
= Total Ingresos
(-) Mantenimiento
(-) Daños
(-) Costo de Venta
(-) Refacciones y Consumibles
(-) Combustible
(-) Transporte y Logística
(-) Seguros de Equipo
(-) Mantenimiento de Equipo
= Utilidad Bruta
  Margen Bruto

  Gastos Administrativos
    (-) Renta
    (-) Nómina
    (-) Servicios Públicos
    (-) Honorarios
    (-) Papelería y Oficina
    (-) Capacitación
  = Total Administrativos

  Gastos Comerciales
    (-) Publicidad
    (-) Comisiones de Ventas
    (-) Viajes y Representación
  = Total Comerciales

  Gastos Financieros
    (-) Intereses Financieros
    (-) Comisiones Bancarias
  = Total Financieros

  Otros Gastos
    (-) Caja Chica
    (-) Otro
  = Total Otros

= Total Egresos
= Utilidad antes de Depreciación
  Margen antes de Depreciación
(-) Depreciación (Equipos Rentados)
= Utilidad Neta
  Margen Neto
```

## Cambios técnicos

1. **`incomeStatement/types.ts`** — Agregar `OPERATING_EXPENSE_GROUPS: { label, categories }[]` con los 4 bloques (Administrativos, Comerciales, Financieros, Otros). `EXPENSE_CATEGORIES` se deriva como el `flatMap` de esos grupos (mantiene compatibilidad con `computeDerivedTotals` y `useStatementTotals`).
2. **`statementRowFactories.ts`** — Reemplazar `operatingExpenseRows` por un builder que, por cada grupo, emite: un encabezado, las filas de categorías y un subtotal `= Total <Grupo>`. Indentar las categorías con doble espacio. Subtotal usa `isSubtotal: true` + `isCost: true`.
3. **`useStatementRows.ts` (comparativa anual)** — Replicar la misma agrupación en `useComparisonRows` para que la vista comparativa muestre los mismos subtotales.
4. **PDF (`IncomeStatementDocument`)** — Sin cambios: renderiza `statementRows`/`comparisonRows` tal cual.
5. **Changelog v6.90.1** (patch — refinamiento de presentación) en `public/changelog.json` + `public/changelog/v6.90.1.json`.

## Notas

- No cambian las fórmulas: `totalExpenses`, `grossProfit`, `netProfit` siguen igual; solo se añaden filas de subtotal informativas.
- No requiere migración SQL.
- Software y Depreciación siguen excluidos del P&L (regla vigente).
- El export CSV incluirá los nuevos renglones de subtotal y encabezado de grupo (cada uno con su `Concepto` y totales).

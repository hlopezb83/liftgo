

## Plan: Tabla de Estado de Resultados en formato vertical tradicional

### Problema actual
La tabla muestra los conceptos financieros como **columnas** y los meses como **filas**. El formato contable tradicional es al revés: los conceptos van como **filas** (de arriba a abajo) y los meses como **columnas**.

### Formato objetivo

```text
Concepto              | Ene 2026 | Feb 2026 | Mar 2026 | Total
──────────────────────|──────────|──────────|──────────|──────
Ingresos              |   $X     |   $X     |   $X     |  $X
──────────────────────|──────────|──────────|──────────|──────
(-) Mantenimiento     |   $X     |   $X     |   $X     |  $X
(-) Daños             |   $X     |   $X     |   $X     |  $X
= Utilidad Bruta      |   $X     |   $X     |   $X     |  $X
──────────────────────|──────────|──────────|──────────|──────
(-) Renta             |   $X     |   $X     |   $X     |  $X
(-) Nómina            |   $X     |   $X     |   $X     |  $X
(-) Software          |   $X     |   $X     |   $X     |  $X
(-) Depreciación      |   $X     |   $X     |   $X     |  $X
(-) Otros             |   $X     |   $X     |   $X     |  $X
= Total Egresos       |   $X     |   $X     |   $X     |  $X
──────────────────────|──────────|──────────|──────────|──────
= Utilidad Neta       |   $X     |   $X     |   $X     |  $X
  Margen Neto         |   X%     |   X%     |   X%     |  X%
```

### Cambios

1. **`src/components/reports/IncomeStatementReport.tsx`** — Transponer la tabla:
   - Columnas: `Concepto | Mes1 | Mes2 | ... | Total`
   - Filas: cada línea del estado de resultados (Ingresos, costos directos, Ut. Bruta, gastos operativos, Total Egresos, Ut. Neta, Margen)
   - Filas de subtotal (Ut. Bruta, Ut. Neta) con estilo `font-semibold` y fondo diferenciado
   - Filas de costo con prefijo `(-)` y color destructive
   - KPIs y gráfica se mantienen sin cambios

2. **`src/lib/changelog.ts`** — v3.15.2


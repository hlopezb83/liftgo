## Plan: Estado de Resultados Mensual

### Concepto

Un nuevo reporte "Estado de Resultados" en la página de Reportes que muestre, para cada mes dentro del rango seleccionado, un desglose tipo estado financiero simplificado:

Los datos sin IVA

```text
┌──────────────────────────────────────┐
│  Estado de Resultados - Ene 2026     │
├──────────────────────────────────────┤
│  Ingresos por Rentas      $120,000  │
│  (-) Costos Mantenimiento  ($8,000) │
│  (-) Costos de Daños       ($2,500) │
│  ──────────────────────────────────  │
│  Utilidad Bruta           $109,500  │
│  Margen Bruto                91.3%  │
└──────────────────────────────────────┘
```

### Fuentes de datos (ya disponibles en ReportsPage)

- **Ingresos**: `invoices` con `status=paid`, agrupados por `paid_at` mes
- **Costos de mantenimiento**: `maintenance_logs.cost`, agrupados por `performed_at` mes
- **Costos de daños**: `damage_records.actual_cost`, agrupados por `created_at` mes

### Cambios

1. **Crear `src/components/reports/IncomeStatementReport.tsx**`
  - Props: `invoices`, `maintenanceLogs`, `damageRecords`, `startDate`, `endDate`
  - Agrupa por mes calendario, calcula ingresos (pagados), costos de mantenimiento, costos de daños, utilidad bruta y margen
  - Vista: tabla con una fila por mes y columnas para cada concepto + fila de totales
  - Gráfica de barras apiladas (ingresos vs costos) por mes
  - Botón de exportar CSV
2. **Modificar `src/pages/ReportsPage.tsx**`
  - Agregar opción `{ value: "income-statement", label: "Estado de Resultados" }` al array `REPORT_TYPES`
  - Renderizar `IncomeStatementReport` con los datos existentes (`invoices`, `maintenanceLogs`, `damageRecords`)
3. **Actualizar `src/lib/changelog.ts**`
  - Entrada v3.13.0

### Sin cambios de base de datos

Todos los datos necesarios ya se consultan en ReportsPage.
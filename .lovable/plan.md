

## Plan: Mejoras al Estado de Resultados (v3.17.0)

Cuatro mejoras al reporte de Estado de Resultados en un solo archivo principal.

### 1. Comparativo Año vs Año
- Agregar modo "Comparativo" al selector de año (ej: "2025 vs 2026")
- Mostrar tabla con columnas: Concepto | 2025 Total | 2026 Total | Variación $ | Variación %
- Solo aparece cuando hay datos de 2+ años

### 2. Gráfica de Utilidad Neta Mensual
- Agregar `LineChart` de Recharts debajo de la gráfica de barras existente
- Línea con la utilidad neta por mes, con área sombreada verde/rojo según positivo/negativo
- Respeta el filtro de año seleccionado

### 3. Fila de Margen Bruto
- Agregar fila "Margen Bruto" (%) justo después de "= Utilidad Bruta"
- Fórmula: `(grossProfit / revenue) * 100`
- Formato y colores iguales al Margen Neto existente

### 4. Exportar a PDF
- Botón "Exportar PDF" junto al botón CSV existente
- Usar jsPDF + `fetchCompanyDataAndLogo()` del patrón existente en `pdfHelpers.ts`
- Encabezado con logo de empresa, título "Estado de Resultados", periodo y año
- Tabla con todos los conceptos y columnas de meses + total
- Formato contable: costos en rojo, subtotales en negrita

### Archivos a modificar

1. **`src/components/reports/IncomeStatementReport.tsx`** — Todas las mejoras (comparativo, LineChart, margen bruto, botón PDF)
2. **`src/lib/changelog.ts`** — v3.17.0

### Detalle técnico

- Comparativo: nuevo `useMemo` que agrupa `data` por año y calcula deltas
- LineChart: componente `LineChart` + `Line` + `ReferenceLine` en y=0
- Margen Bruto: nueva entrada en `statementRows` con `isPercent: true` e `isSubtotal: false`
- PDF: función `generateIncomeStatementPdf()` usando `jsPDF` con `doc.autoTable` simulado manualmente (filas dibujadas con `doc.text()` y líneas)


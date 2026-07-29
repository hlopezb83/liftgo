# Changelog

## 7.254.0 — 29/07/2026

- R23-1: se restauraron 10 celdas de dinero que se renderizaban vacías (proveedores, pólizas, reportes de costos/antigüedad/ingresos y portal) + guard automático `moneyCellRegression.test.ts`.
- R23-2: la vista de impresión libera `height`/`overflow` del shell `h-[100dvh]`, evitando el recorte del contenido.
- R23-A: `FormDialog` expone `requestClose` por contexto; el botón "Cancelar" de `FormActions` respeta el aviso de cambios sin guardar.
- R23-B: `ProspectFormDialog` espera el guardado antes de cerrar y conserva la captura si falla.
- R23-C: `useMoveProspectStage` sólo invalida cuando no quedan movimientos en vuelo (sin rebotes al arrastrar rápido).
- R23-D: KPIs de Cuentas por Pagar usan `kpiSizeClass` para montos largos.
- R23-E: `parseAmount` interpreta correctamente la coma decimal es-MX ("1.500,50" → 1500.50).



## 7.253.4 — 29/07/2026

- Se aisló la limpieza de datos E2E para que las ejecuciones paralelas de CRM y conciliación bancaria no borren escenarios activos.
- La prueba del Kanban ahora espera la confirmación de persistencia antes de recargar la página.
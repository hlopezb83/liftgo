

# Plan: Selector de Rango por Mes para Estado de Resultados

## Resumen
Reemplazar el `DateRangePickerField` (selección por día) con dos selectores de mes/año (Mes Inicio y Mes Fin) usando componentes `Select` estándar.

## Cambios

### `src/pages/IncomeStatementPage.tsx`
- Eliminar `DateRangePickerField` y dependencia de `DateRange`
- Agregar estado `startMonth` (mes/año) y `endMonth` (mes/año) usando `useState` con valores por defecto (3 meses atrás → mes actual)
- Renderizar dos `Select`: uno para mes inicio, otro para mes fin
- Generar opciones dinámicamente: últimos 24 meses en formato "Enero 2025", "Febrero 2025", etc.
- Calcular `startDate` como primer día del mes inicio y `endDate` como último día del mes fin
- Pasar fechas calculadas al `IncomeStatementReport` sin cambios en ese componente

### UI
- Dos selectores lado a lado: "Desde" y "Hasta"
- Labels en español: meses con `date-fns/locale/es`
- Mismo Card wrapper actual

### `src/lib/changelog.ts`
- Entrada v3.22.1


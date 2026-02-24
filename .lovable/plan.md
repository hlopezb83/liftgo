

# Reporte de Rentabilidad por Modelo de Equipo

## Objetivo
Agregar un nuevo tipo de reporte que agrupe todos los montacargas por su modelo (manufacturer + model) y calcule la rentabilidad neta de cada modelo. Esto permite comparar que modelos generan mas ganancia y cuales conviene comprar mas.

## Calculo
Para cada modelo de equipo (agrupando todos los montacargas que comparten manufacturer + model):

- **Ingresos**: Suma de facturas pagadas vinculadas a bookings de esos montacargas
- **Costos de mantenimiento**: Suma de costos de maintenance_logs de esos montacargas
- **Costos de danos**: Suma de actual_cost de damage_records de esos montacargas
- **Ganancia neta** = Ingresos - Mantenimiento - Danos
- **Margen %** = (Ganancia / Ingresos) x 100
- **Unidades**: Cantidad de montacargas de ese modelo en la flota

Todo filtrado por el rango de fechas seleccionado.

## Visualizacion
- Grafica de barras horizontales mostrando ganancia neta por modelo (verde para positivo, rojo para negativo)
- Tabla detallada con columnas: Modelo, Unidades, Ingresos, Mantenimiento, Danos, Ganancia Neta, Margen %
- Boton de exportar CSV
- Ordenado por ganancia neta de mayor a menor

## Cambios tecnicos

### 1. Nuevo componente: `src/components/reports/ProfitabilityByModelReport.tsx`
- Recibe como props: forklifts, invoices, bookings, maintenanceLogs, damageRecords, startDate, endDate
- Agrupa montacargas por `manufacturer + " " + model`
- Cruza bookings con invoices pagadas para obtener ingresos por montacargas
- Suma costos de mantenimiento y danos por montacargas
- Agrega todo a nivel de modelo
- Renderiza grafica de barras + tabla con los resultados

### 2. Actualizar `src/pages/ReportsPage.tsx`
- Agregar nuevo tipo de reporte "profitability" con label "Rentabilidad por Modelo" al arreglo REPORT_TYPES
- Importar hook `useDamageRecords` para obtener los datos de danos
- Renderizar el nuevo componente ProfitabilityByModelReport cuando se seleccione este tipo

### 3. No se requieren cambios en base de datos
Todo el calculo se hace en el frontend con datos ya disponibles (forklifts, bookings, invoices, maintenance_logs, damage_records).


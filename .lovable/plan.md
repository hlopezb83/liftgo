

# Reporte: Utilizacion de Flota por Modelo

## Resumen

Nuevo tipo de reporte **"Utilizacion por Modelo"** en la pagina de Reportes (`/reports`), que agrupa todos los equipos por modelo (Manufacturer + Model) y calcula metricas de utilizacion agregadas. Esto permite identificar que modelos tienen alta demanda y cuales tienen capacidad ociosa, facilitando decisiones de compra.

---

## Que mostrara el reporte

### Grafica de barras horizontales
- Eje Y: Modelo (ej: "Toyota 8FGU25", "Hyster H50FT")
- Eje X: % de utilizacion promedio
- Color: verde para alta utilizacion (>75%), amarillo para media (40-75%), rojo para baja (<40%)

### Tabla de detalle

| Modelo | Unidades | Disponibles | Rentados | Dias Reservados | Dias Totales | Utilizacion % |
|--------|----------|-------------|----------|-----------------|--------------|---------------|
| Toyota 8FGU25 | 4 | 1 | 3 | 320 | 480 | 67% |
| Hyster H50FT | 2 | 2 | 0 | 40 | 240 | 17% |

- **Unidades**: total de equipos de ese modelo (excluyendo vendidos/retirados)
- **Disponibles / Rentados**: estado actual de las unidades
- **Dias Reservados**: suma de dias con reserva activa en el rango de fechas
- **Dias Totales**: unidades x dias del rango
- **Utilizacion %**: (Dias Reservados / Dias Totales) x 100
- Exportacion a CSV incluida

---

## Cambios tecnicos

### 1. Crear `src/components/reports/UtilizationByModelReport.tsx`

Nuevo componente que:
- Recibe `forklifts`, `bookings`, `startDate`, `endDate` (mismo patron que `UtilizationReport`)
- Agrupa forklifts por clave `manufacturer + model` (o `name` si no tiene manufacturer/model)
- Para cada modelo, calcula: total de unidades activas, cuantas estan disponibles/rentadas hoy, dias reservados en el rango, y % de utilizacion
- Renderiza grafica de barras horizontales con colores segun nivel de utilizacion
- Renderiza tabla con las columnas descritas
- Boton de exportar CSV

### 2. Modificar `src/pages/ReportsPage.tsx`

- Agregar `{ value: "utilization-model", label: "Utilizacion por Modelo" }` al array `REPORT_TYPES`
- Agregar el bloque condicional para renderizar `UtilizationByModelReport` cuando `reportType === "utilization-model"`
- Pasa los mismos props que el reporte de utilizacion existente (`forklifts`, `bookings`, `startDate`, `endDate`)

### 3. Modificar `src/lib/changelog.ts`

- Agregar entrada v3.4.0 con la nueva funcionalidad

---

## Archivos a crear/modificar

1. **Crear** `src/components/reports/UtilizationByModelReport.tsx`
2. **Modificar** `src/pages/ReportsPage.tsx` - agregar opcion y renderizado
3. **Modificar** `src/lib/changelog.ts`

No se requieren cambios en la base de datos. Toda la logica se calcula en el frontend con los datos existentes de `forklifts` y `bookings`.


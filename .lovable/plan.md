

## Análisis: Gastos Operativos en el Estado de Resultados

La respuesta corta: **necesitas ambos** -- una tabla para registrar gastos y el reporte para visualizarlos.

### Por qué necesitas un módulo de gastos

Los gastos que mencionas (renta, nómina, software, depreciación) no tienen origen en ninguna tabla existente. Mantenimiento y daños ya se capturan, pero estos nuevos conceptos necesitan un lugar donde registrarse. Sin una tabla de gastos operativos, no hay datos que mostrar en el reporte.

### Propuesta

**1. Nueva tabla `operating_expenses`**
- `id`, `category` (enum: renta, nómina, software, depreciación, otro), `description`, `amount`, `expense_date`, `created_at`
- RLS siguiendo el patrón existente (admin/administrativo full, auditor read, etc.)

**2. Página sencilla de Gastos Operativos**
- Tabla con filtros por categoría y rango de fechas
- Formulario para agregar/editar gastos (monto, categoría, fecha, descripción)
- Entrada en el sidebar bajo la sección financiera

**3. Actualizar el Estado de Resultados**
- Consultar `operating_expenses` agrupados por mes
- Agregar filas: Renta, Nómina, Software, Depreciación, Otros
- El reporte queda así:

```text
┌──────────────────────────────────────┐
│  Estado de Resultados - Ene 2026     │
├──────────────────────────────────────┤
│  Ingresos por Rentas      $120,000  │
│  (-) Mantenimiento          $8,000  │
│  (-) Daños                  $2,500  │
│  (-) Renta                 $15,000  │
│  (-) Nómina                $30,000  │
│  (-) Software               $3,000  │
│  (-) Depreciación           $5,000  │
│  (-) Otros                  $1,000  │
│  ──────────────────────────────────  │
│  Utilidad Neta             $55,500  │
│  Margen Neto                 46.3%  │
└──────────────────────────────────────┘
```

### Cambios técnicos

1. **Migración DB**: Crear enum `expense_category` y tabla `operating_expenses` con RLS
2. **Hook `useOperatingExpenses.ts`**: CRUD estándar con react-query
3. **Página `OperatingExpensesPage.tsx`**: Lista + formulario inline o diálogo
4. **Ruta + Sidebar**: Agregar entrada `/gastos-operativos`
5. **Modificar `IncomeStatementReport.tsx`**: Recibir y desglosar gastos operativos por categoría
6. **Modificar `ReportsPage.tsx`**: Pasar datos de gastos al componente
7. **Changelog**: v3.14.0

### Sin cambios a tablas existentes
Se reutilizan `maintenance_logs` y `damage_records` tal cual; solo se agrega la nueva tabla.


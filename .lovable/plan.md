
## Objetivo

Hoy el Estado de Resultados clasifica los ingresos en solo dos cubetas:

- **Ingresos por Rentas** — cualquier factura con señal de renta (booking, `invoice_bookings`, `quote_type='rental'` o `billing_period_*` presente).
- **Otros ingresos (sin reserva)** — el resto (incluye ventas de equipo y facturas manuales sin señal de renta).

Esto oculta dos cosas importantes: (1) las rentas facturadas manualmente sin `booking_id` se mezclan con las rentas con reserva (aunque no tienen contrato/booking detrás), y (2) las ventas reales de equipo se agrupan con "otros" (facturas manuales misceláneas). El usuario pide tres cubetas explícitas.

## Nueva clasificación de ingresos

Cada factura no borrador/cancelada se etiqueta con una y solo una categoría:

```text
1. Rentas con reserva
   invoice.booking_id IS NOT NULL
   OR EXISTS invoice_bookings(invoice_id = i.id)

2. Rentas sin reserva
   (no cae en 1) AND (
     quotes.quote_type = 'rental' (via quote_id)
     OR (billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL)
   )

3. Ventas de equipo / otros
   Todo lo demás. Se sub-etiqueta:
     - "venta" si quotes.quote_type = 'sale'
       o si hay quote_assigned_forklifts (ya se usa para CGV)
     - "otro" en cualquier otro caso (facturas manuales sueltas)
```

Las **notas de crédito** heredan la clasificación de su factura origen (misma lógica que hoy) y se restan de la cubeta correspondiente.

Auditoría rápida de datos actuales (últimos 3 meses):

- 46 facturas con reserva por $1,364,100 → cubeta 1
- 1 factura tipo `sale` por $496,602 → cubeta 3 (venta)
- 1 factura manual por $10,500 → cubeta 3 (otro)

Hoy no se detectan rentas sin reserva reales; la nueva estructura queda lista para cuando aparezcan (ya pasó con FAC-0089 antes de v7.71.1).

## Cambios

### 1. RPC `get_income_statement` (migración SQL)

Reemplazar `is_rental` boolean por un CASE con tres valores:

```sql
CASE
  WHEN i.booking_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
    THEN 'rental_booked'
  WHEN (i.quote_id IN (SELECT id FROM rental_quotes))
       OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
    THEN 'rental_unbooked'
  ELSE 'sales'
END AS revenue_kind
```

Del agregado mensual salen cinco campos numéricos (además de `revenue`):

- `revenue_rental_booked`
- `revenue_rental_unbooked`
- `revenue_sales`
- Notas de crédito equivalentes: `credit_rental_booked`, `credit_rental_unbooked`, `credit_sales`

Y tres breakdowns por cliente:

- `rental_booked_by_customer`
- `rental_unbooked_by_customer`
- `sales_by_customer`

`revenue` sigue siendo la suma de los tres (netos de notas de crédito).

### 2. Tipos y hooks (`src/features/reports/hooks/incomeStatement/`)

- `types.ts` — agregar `revenueRentalBooked` y `revenueRentalUnbooked` a `MonthData` y `YearTotals`; renombrar interno `revenueRental` → `revenueRentalBooked`. Añadir `rentalUnbookedByCustomer` a `MonthData`.
- `useMonthlyData.ts` — mapear los nuevos campos del RPC y el nuevo breakdown.
- `useStatementTotals.ts` — sumar los tres campos en `aggregate`.
- `useStatementRows.ts` / `statementRowFactories.ts` — reemplazar las dos filas de ingresos por tres, y exponer `rentalUnbookedBreakdownRows`.

### 3. Presentación

- `IncomeStatementTable.tsx` — recibir el nuevo breakdown y pasarlo al helper.
- `incomeStatementHelpers.ts` — mapear las tres etiquetas expandibles:
  - `"  Ingresos por Rentas (con reserva)"` → breakdown por cliente
  - `"  Ingresos por Rentas (sin reserva)"` → breakdown por cliente
  - `"  Ingresos por Ventas de Equipo"` → breakdown por cliente
- Ajustar `getBreakdownFor` con las tres claves (`rentalBooked`, `rentalUnbooked`, `sales`).

### 4. Chart apilado

- Revisar `IncomeStatementChart` (si existe) para apilar tres series en vez de dos, con colores consistentes (usar tokens semánticos, no colores hardcodeados). Si no existe chart apilado, omitir este paso.

### 5. Tests y changelog

- Actualizar `statementRowFactories.test.ts` y `incomeStatementHelpers.test.ts` para las tres etiquetas.
- Actualizar fixture `pdfFixtures.ts` con los tres campos.
- Nueva entrada `public/changelog/v7.108.0.json` (minor: nuevo desglose contable) y bump en `public/changelog.json`.

## Compatibilidad y riesgos

- El PDF/CSV consumen `statementRows` genéricamente → funcionan automáticamente con la nueva fila.
- `Utilidad Bruta`, `Total Ingresos`, `Margen`, `Depreciación` y `COGS` no cambian: `revenue` sigue siendo la suma de los tres.
- El COGS automático (`cogs_forklift_sales`) sigue calculándose solo para facturas de venta (`NOT is_rental` en la lógica actual → equivalente a `revenue_kind = 'sales'` con `quote_assigned_forklifts`). Se mantiene la condición.
- Migración es un `CREATE OR REPLACE FUNCTION`, sin cambios de schema.

## Fuera de alcance

- No se re-clasifican facturas históricas manualmente (la nueva lógica se aplica retroactivamente vía RPC).
- No se toca el KPI de MRR del dashboard (usa RPC distinta).
- No se agregan filtros de UI por sub-cubeta (solo el desglose expandible existente).

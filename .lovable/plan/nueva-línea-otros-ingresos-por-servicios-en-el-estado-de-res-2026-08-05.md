# Nueva línea "Otros ingresos por servicios" en el Estado de Resultados

## Problema confirmado

Hoy el Estado de Resultados clasifica cada factura con 4 señales y, si no encuentra ninguna, la manda por descarte a **Ingresos por Ventas de Equipo**. Revisión de las facturas que hoy caen en "Ventas":

| Factura | Cliente | Mes | Subtotal | ¿Tiene partida "Venta de equipo"? |
|---|---|---|---|---|
| FAC-0094 | FABTEC | jul 2026 | 10,500 | No — "Servicio de Logistica" x2 |
| FAC-0060 | Monumentos Publicitarios | may 2026 | 496,602 | Sí |
| FAC-0027 | BERN CO | feb 2026 | 501,325 | Sí |
| FAC-0001 | Indimex Glass | nov 2025 | 2,115,856 | Sí |
| FAC-0025 / FAC-0026 | Medusa Capital | oct 2025 | 525,113 c/u | Sí |

Sólo FAC-0094 no corresponde a una venta de equipo: es un servicio de logística facturado suelto.

## Qué se va a construir

Una cuarta categoría de ingreso, **Otros ingresos por servicios**, para facturas que no son renta ni venta de equipo (logística, maniobras, fletes, servicios sueltos). "Ventas de Equipo" pasa a contar sólo ventas reales.

Las cuatro líneas del bloque de ingresos quedan así:

```text
Ingresos por Rentas (con reserva)
Ingresos por Rentas (sin reserva)
Ingresos por Ventas de Equipo
Otros ingresos por servicios      <- nueva
= Ingresos Totales
```

Cada línea sigue siendo expandible con su desglose por cliente. El total de ingresos y la utilidad no cambian: sólo se reparte distinto lo que ya estaba.

Con este cambio, FAC-0094 (FABTEC, jul 2026, $10,500) se mueve de "Ventas de Equipo" a "Otros ingresos por servicios", de forma retroactiva en todos los meses.

## Regla de clasificación

Una factura se cuenta como **Venta de Equipo** sólo si cumple al menos una de estas:
- su cotización es de tipo venta (`quote_type = 'sale'`), o
- alguna de sus partidas termina en "- Venta de equipo" (mismo criterio que ya usa el sistema en `saleLines.ts`).

Si no cumple ninguna y tampoco es renta ni cargo por daño, se cuenta como **Otros ingresos por servicios**.

Las notas de crédito heredan la misma clasificación que su factura padre, igual que hoy.

## Detalles técnicos

**Migración (RPC `get_income_statement`)**
- En `inv_classified` y `cn_classified`: agregar el caso `'other_services'` antes del `ELSE 'sales'`, con la regla de arriba (cotización tipo venta o partida con sufijo "- Venta de equipo" vía `jsonb_array_elements` sobre `line_items`).
- Nuevos campos por mes: `revenue_other_services`, `other_services_by_customer`, más su contraparte en notas de crédito (`credit_other_services`), siguiendo exactamente el patrón de `revenue_sales` / `sales_by_customer`.
- `sale_invoice_forklifts` (base del costo de venta) ya filtra por `revenue_kind = 'sales'`; al endurecer la definición de "sales" el costo de venta queda igual o más preciso.
- La subconsulta `v_sold_without_cost` debe replicar la nueva condición para no listar facturas de servicio como "equipo vendido sin costo".

**Frontend (`src/features/reports/`)**
- `hooks/incomeStatement/types.ts`: `revenueOtherServices` y `otherServicesByCustomer` en `MonthData` y en los totales.
- `useMonthlyData.ts`: mapear los nuevos campos del RPC.
- `useStatementTotals.ts`: acumular la nueva línea.
- `statementRowFactories.ts` y `useStatementRows.ts`: nueva fila "  Otros ingresos por servicios" + `otherServicesBreakdownRows`.
- `incomeStatementHelpers.ts`: nueva clave `otherServices` en `getBreakdownFor`.
- `IncomeStatementTable.tsx` / `IncomeStatementReport.tsx`: pasar el nuevo desglose y agregar la serie a la gráfica de barras apiladas.
- CSV y PDF heredan la estructura automáticamente.
- Actualizar tests existentes de `statementRowFactories` e `incomeStatementHelpers` y agregar cobertura de la nueva fila.

**Changelog**: entrada v7.280.0 (minor) en `public/changelog.json` + `public/changelog/v7.280.0.json`, y alineación de `package.json` / `version.json`.

## Fuera de alcance

- No se modifica FAC-0094 ni ninguna otra factura: sólo cambia cómo se agrupan en el reporte.
- No se toca el Dashboard ni otros reportes.

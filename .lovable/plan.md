# Notas de crédito como renglón propio (contra-ingreso) en el Estado de Resultados

## Qué encontré

En julio 2026 el renglón "Ingresos por Rentas (con reserva)" y su desglose por cliente no cuadran por **$32,220**:

- Facturas de renta con reserva de julio (8 clientes): **$409,800** — es lo que suma el desglose.
- El renglón del reporte ya resta la nota de crédito FAC-0089 (LOGISTORAGE, $32,220) y muestra **$377,580**.

Hoy el RPC `get_income_statement` resta las notas de crédito directamente dentro de cada categoría de ingreso, pero las agregaciones por cliente se calculan sólo con facturas. Por eso las partes no suman el total.

## Mejor práctica (Odoo / QuickBooks)

Ambos tratan las notas de crédito como **contra-ingreso**, no como una resta silenciosa:

- QuickBooks: cuenta "Sales Returns and Allowances" que aparece como renglón negativo debajo de Ingresos brutos, y luego "Net Sales".
- Odoo: los credit notes son asientos en las mismas cuentas de ingreso pero con signo contrario; los reportes muestran el movimiento, de modo que puedes ver bruto y neto.

Regla contable: nunca se "borra" la venta original; se muestra la reducción por separado para conservar la trazabilidad. Eso es exactamente lo que pides.

## Cambio propuesto

### Estructura nueva del bloque de ingresos

```text
Ingresos por Rentas (con reserva)        409,800   [expandible por cliente]
Ingresos por Rentas (sin reserva)              …   [expandible por cliente]
Ingresos por Ventas de Equipo                  …   [expandible por cliente]
Otros Ingresos por Servicios                   …   [expandible por cliente]
Recuperación de Daños                          …   [expandible por cliente]
(-) Notas de Crédito                     -32,220   [expandible por cliente]
= Ingresos Netos                          377,580
```

Cada categoría vuelve a mostrar el **importe bruto facturado**, que ya cuadra con su desglose; las notas de crédito viven en su propio renglón negativo, expandible por cliente (mostrando factura afectada), y el subtotal de Ingresos Netos es el que alimenta la utilidad bruta y todos los cálculos posteriores.

### Base de datos

Migración que reescribe `public.get_income_statement`:

1. Los campos `revenue_rental_booked`, `revenue_rental_unbooked`, `revenue_sales`, `revenue_other_services`, `revenue_damage_recovery` dejan de restar notas de crédito (quedan brutos y cuadran con su desglose por cliente).
2. Nuevos campos por mes: `credit_notes_total` (positivo, se presenta en negativo) y `credit_notes_by_customer` (desglose por cliente y factura afectada).
3. `revenue` se conserva como **ingreso neto** (bruto menos notas de crédito) para no alterar utilidad bruta, márgenes ni ningún KPI que ya lo consuma.

### Frontend

- `types.ts` / `useMonthlyData.ts`: mapear `creditNotes` y `creditNotesByCustomer`.
- `statementRowFactories.ts` / `useStatementRows.ts`: nuevo renglón "(-) Notas de Crédito" (isCost) más su breakdown, y subtotal "= Ingresos Netos" antes de costos.
- `incomeStatementHelpers.ts` (`getBreakdownFor`): registrar la clave `creditNotes`.
- `IncomeStatementTable.tsx` / `IncomeStatementReport.tsx`: mostrar el renglón y su drill-down; CSV y PDF lo heredan.
- Comparativo anual (`useComparisonRows`): agregar la fila equivalente.

## Verificación

- SQL por mes de 2026: cada categoría bruta debe igualar la suma de su desglose por cliente (±$0.01), y `bruto − notas de crédito = revenue`.
- Julio en `/reports` (Estado de Resultados): rentas con reserva 409,800 con LOGISTORAGE en 55,500, renglón de notas de crédito −32,220, Ingresos Netos 377,580.
- `tsgo` + suite de tests de reports; actualizar fixtures de PDF/CSV y tests de `statementRowFactories`.

## Detalle técnico

- Cambios: una migración de base de datos y los archivos de `src/features/reports/{hooks,components}/incomeStatement/`.
- Changelog: nueva entrada `v7.281.0` (minor) en `public/changelog.json` + `public/changelog/v7.281.0.json`, alineando `package.json` y `public/version.json`.

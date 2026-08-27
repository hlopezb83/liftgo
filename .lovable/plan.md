# Cierre de la auditoría — pendientes (B3, B5, B6, A3, A4, A7)

Ya aplicado en esta sesión: **B4** — las tres pantallas de cotizaciones
(`QuotesPage.tsx`, `quotesColumns.tsx`, `QuoteDetailActions.tsx`) ya calculan el
"hoy" con `nowMty()` en vez del reloj del navegador, así que una cotización ya no
puede verse vencida un día antes.

Falta lo siguiente (mismo alcance ya aprobado).

## Tanda 1 — Lo que se ve en pantalla

**B3 · Un error de carga del CRM se ve como "Sin registros"**
`useCRMMetrics` sólo devuelve `data` e `isLoading`; si la consulta de prospectos
falla (red o permisos), `CRMClosedPage` pinta Ganados y Perdidos vacíos. Se
propaga `isError` y `refetch` desde `useProspects` → `useCRMMetrics` →
`useClosedProspects`, y la página muestra el `QueryErrorState` con reintento que
ya usan las demás listas.

**B5 · Detalle del proveedor sin aviso de truncamiento**
La página suma totales sobre listas con tope de filas y no avisa. Se agrega
`ListTruncationNotice` sobre las tablas de gastos y mantenimientos cuando se
alcanza el tope.

**B6 · El saldo de la factura no revisa la moneda de los pagos**
`deriveInvoiceData` en `src/features/invoices/pages/InvoiceDetail.tsx:36` suma
`p.amount` sin comparar la moneda del pago contra la de la factura. Se convierte
cada pago a la moneda del documento y, si algún pago quedó capturado en otra
moneda sin tipo de cambio, se muestra una advertencia arriba del saldo.

## Tanda 2 — Bombas de tiempo de moneda (base de datos)

Hoy todo está en pesos; revienta con la primera factura o renta en dólares.

**A3 · Estado de resultados** — `get_income_statement`, CTE `sb_base`: los gastos
usan `subtotal` crudo mientras el ingreso sí se convierte. Se normaliza con
`currency`/`exchange_rate` y se excluyen las facturas de proveedor en borrador,
que los KPIs de Cuentas por Pagar ya excluyen a propósito.

**A4 · MRR y KPIs financieros** — `get_financial_kpis` y `get_mrr_detail` suman
`monthly_rate` sin mirar `bookings.currency` / `bookings.tipo_cambio`. Se
convierte a MXN igual que en el resto de los reportes.

Ambas conservan `SECURITY DEFINER`, `SET search_path = public` y el guard de
roles, según las reglas del proyecto.

## Tanda 3 — Aviso operativo

**A7 · Facturas de proveedor sin fecha de vencimiento**
Hay 5 facturas pendientes sin `due_date`: el reporte de antigüedad las manda a
"Corriente" y los KPIs de vencido las ignoran. No se inventa una fecha: se marcan
como "Sin vencimiento" en el listado de Cuentas por Pagar y se cuentan aparte en
el reporte de antigüedad, para que se capturen.

## Notas técnicas

- La normalización de moneda reutiliza el helper `toMxn` existente.
- Las dos funciones de base de datos van en una sola migración.
- Se corre typecheck, la suite de pruebas y se revisa el preview.
- Al cerrar se agrega la entrada de changelog correspondiente (minor).

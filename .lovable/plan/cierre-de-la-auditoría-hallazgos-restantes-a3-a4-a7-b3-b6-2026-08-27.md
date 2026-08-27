# Cierre de la auditoría: hallazgos restantes (A3, A4, A7, B3–B6)

Ya quedaron A1, A2, A5, A6, B1 y B2 (v7.361.0). Faltan siete: dos de UI que el
usuario ya está sintiendo, tres latentes de moneda y dos avisos operativos.

## Tanda 1 — Lo que se ve hoy en pantalla

**B4 · "Vencida" con el reloj del navegador**
Tres lugares calculan el día de hoy con `toYMD(new Date())` en vez de la hora de
Monterrey: `src/features/quotes/pages/QuotesPage.tsx:114`,
`src/features/quotes/pages/quotesColumns.tsx:79` y
`src/features/quotes/components/quotes/QuoteDetailActions.tsx:164`. Cerca de
medianoche, o con la zona horaria del equipo mal puesta, una cotización aparece
vencida y el botón "Aceptar" se bloquea un día antes. Se cambian por `nowMty()`
(mismo helper que ya usa el resto del sistema).

**B3 · Un error de carga del CRM se ve como "Sin registros"**
`useCRMMetrics` sólo devuelve `data` e `isLoading`; si la consulta de prospectos
falla (red o permisos), `CRMClosedPage` pinta las tablas de Ganados y Perdidos
vacías. Se propaga `isError` y `refetch` desde `useProspects` → `useCRMMetrics`
→ `useClosedProspects`, y la página muestra el estado de error con reintento que
ya usan las demás listas.

**B5 · Detalle del proveedor sin aviso de truncamiento**
La página suma totales sobre listas con tope de filas y no avisa. Se agrega el
aviso de lista truncada (el componente ya existe) sobre las tablas de gastos y
mantenimientos cuando se alcanza el tope.

**B6 · El saldo de la factura no revisa la moneda de los pagos**
`deriveInvoiceData` en `src/features/invoices/pages/InvoiceDetail.tsx:36` suma
`p.amount` sin comparar la moneda del pago contra la de la factura. Se convierte
cada pago a la moneda del documento y, si algún pago quedó capturado en otra
moneda sin tipo de cambio, se muestra una advertencia arriba del saldo.

## Tanda 2 — Bombas de tiempo de moneda (base de datos)

Hoy todo está en pesos, así que nada de esto se ve todavía; revienta con la
primera factura o renta en dólares.

**A3 · Estado de resultados**
`get_income_statement`, CTE `sb_base`: los gastos usan `subtotal` crudo mientras
el ingreso sí se convierte. Se normaliza con `currency`/`exchange_rate`. En la
misma migración se excluyen las facturas de proveedor en borrador, que los KPIs
de Cuentas por Pagar ya excluyen a propósito.

**A4 · MRR y KPIs financieros**
`get_financial_kpis` y `get_mrr_detail` suman `monthly_rate` sin mirar
`bookings.currency` / `bookings.tipo_cambio`. Se convierte a MXN igual que en el
resto de los reportes.

Ambas conservan `SECURITY DEFINER`, `SET search_path = public`, el guard de roles
y `(select auth.uid())` en cualquier policy, según las reglas del proyecto.

## Tanda 3 — Aviso operativo

**A7 · Facturas de proveedor sin fecha de vencimiento**
Hay 5 facturas pendientes sin `due_date`: el reporte de antigüedad las manda a
"Corriente" y los KPIs de vencido las ignoran, así que se pueden pagar tarde sin
que nadie las vea. No se inventa una fecha: se marcan visualmente como "Sin
vencimiento" en el listado de Cuentas por Pagar y se cuentan aparte en el reporte
de antigüedad, para que se capturen.

## Notas técnicas

- Los cambios de UI no tocan lógica de negocio salvo la normalización de moneda,
  que reutiliza el helper `toMxn` ya existente.
- Las dos funciones de base de datos se entregan en una sola migración.
- Se corre typecheck, la suite de pruebas y se revisa la app en el preview.
- Al cerrar se agrega la entrada de changelog correspondiente (minor).

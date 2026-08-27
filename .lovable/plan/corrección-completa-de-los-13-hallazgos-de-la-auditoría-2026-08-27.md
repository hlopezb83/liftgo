# Corrección completa de los 13 hallazgos de la auditoría

Se corrigen todos los hallazgos (A1–A7, B1–B6) en cuatro tandas, de mayor a menor impacto.
Cada tanda cierra con pruebas y una entrada nueva en el changelog.

## Tanda 1 — Dinero que hoy se está perdiendo

- **A1 · Ingreso por unidad sin facturas recurrentes ($716,300):** que el ingreso por
  montacargas y la utilización del Panel consideren también las facturas ligadas por varias
  reservas, no solo la reserva única. Se replica el patrón que ya funciona en el reporte de
  utilidad por modelo, prorrateando el monto entre las reservas que cubre la factura.
- **A2 · Rentabilidad por cliente inflada ~16%:** medir el ingreso sin IVA, restar las notas de
  crédito, convertir a pesos y excluir los datos de prueba.
- **A5 · Equipos "rentados" fantasma:** nuevo aviso operativo de "reservas vencidas sin cerrar"
  en el Panel, con acceso directo a capturar la inspección de retorno, y corrección puntual de
  las 2 unidades hoy atoradas.

## Tanda 2 — Totales que mezclan monedas (frontend)

- **B1 · Total de gastos del proveedor:** convertir cada factura a pesos y excluir borradores.
- **B2 · Balance del contrato:** traer moneda y tipo de cambio en el resumen financiero y
  convertir antes de sumar.
- **B6 · Saldo de factura:** avisar cuando un pago está en una moneda distinta a la factura, y
  convertir para el cálculo del saldo.
- **B5 · Aviso de truncamiento** en el detalle del proveedor, igual que en el resto de listados.

## Tanda 3 — Errores ocultos y fechas

- **B3 · CRM cerrados:** mostrar estado de error en vez de "Sin registros." cuando la consulta falla.
- **B4 · Cotizaciones "Vencida":** usar la fecha del negocio (Monterrey) en las tres pantallas
  afectadas, en lugar del reloj del navegador.

## Tanda 4 — Preventivos y menores

- **A3 · Estado de resultados:** convertir los gastos de proveedor a pesos y excluir borradores.
- **A4 · MRR y KPIs financieros:** convertir las rentas mensuales a pesos.
- **A6 · Facturas pagadas sin renglón de pago:** restaurar el respaldo del Panel para los 16
  registros históricos.
- **A7 · Facturas de proveedor sin vencimiento:** marcarlas aparte en el reporte de antigüedad
  en lugar de contarlas como "Corriente".

## Detalles técnicos

- Migraciones (una por tanda) que recrean: `get_forklift_financials`, `get_dashboard_stats`
  (bloque `utilization` y respaldo de pagos), `get_customer_profitability`,
  `get_income_statement` (`sb_base`), `get_financial_kpis` y `get_mrr_detail`. Todas conservan
  `SECURITY DEFINER`, `SET search_path = public` y sus guards de rol actuales.
- Corrección de datos de A5 vía cierre de estado de las 2 unidades, más un hook/tarjeta nueva
  `useOverdueBookings` en el Panel.
- Frontend: `SupplierDetailPage.tsx`, `RentalFinancialSummary.tsx` +
  `useContractFinancialSummary`, `InvoiceDetail.tsx` (`deriveInvoiceData`),
  `useClosedProspects.ts` / `CRMClosedPage.tsx`, `quotesColumns.tsx`, `QuotesPage.tsx`,
  `QuoteDetailActions.tsx`. Todo con `toMxn(...)` y `nowMty()` ya existentes.
- Pruebas unitarias nuevas para conversión de moneda y vigencia de cotizaciones; smoke SQL para
  los RPC recreados. Se corre la suite completa al cierre de cada tanda.
- Changelog: una entrada minor por tanda (v7.361.0 a v7.364.0).

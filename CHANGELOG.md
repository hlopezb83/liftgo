# Changelog

## 7.273.2 — 01/08/2026

Auditoría Ronda 9 · Cierre: cobertura de pruebas.

- E2E `tests/e2e/quote-edit-prefill.spec.ts`: recorre lista → detalle → editar y verifica que los valores precargados sobreviven la ventana de ~1.5 s en la que el `reset()` tardío los borraba (condición NO-GO del documento R9).
- `supabase/tests/r9_smoke.sql`: valida `today_mty()`, ausencia de `CURRENT_DATE` en funciones de negocio, `v_overdue_invoices` sobre `today_mty()`, `quotes.rejected_at` poblado y CxP sin aprobación huérfana. Ejecutado contra el entorno: 5/5 OK.
- Nuevas pruebas unitarias (40): `deriveForkliftDisplayStatus`, `buildLabel` (bitácora), `resolveDeliveryForkliftName`, columna de aprobación de CxP, esquema de sobrepago del portal, `useQuote` con `maybeSingle()`, `setStatus` con `rejected_at` y gate de `ProspectHistoryCard`.
- E2E de `DateRangePickerField`: confirma auto-aplicación al completar el rango y ausencia del botón "Aplicar".
- Bitácora: `actorLabel()` distingue "Sistema" (sin `actor_id`) de un usuario no identificado (`Usuario <id corto>`).
- Refactor de apoyo: se extrajeron `deriveForkliftDisplayStatus` y `resolveDeliveryForkliftName` desde las páginas para poder probarlos sin montarlas.

## 7.273.1 — 01/08/2026

Auditoría Ronda 9 · Fase 2: los 7 detalles P2.

- Cotizaciones: `rejected_at` al rechazar; detalle con `maybeSingle()` (fin del 406 tras borrar).
- CxP: la columna de aprobación deja de mostrar "Por aprobar" en facturas pagadas o canceladas.
- Portal: el sobrepago indica el saldo pendiente exacto y el botón permanece habilitado para dar retroalimentación.
- Bitácora: nombres y roles legibles en lugar de identificadores hexadecimales.
- Entregas: el nombre del montacargas se toma del join de la consulta, con el mapa de flota como respaldo.
- Filtros: `DateRangePickerField` se aplica solo al completar el rango.


## 7.273.0 — 01/08/2026

Auditoría Ronda 9 (pre-release): cierre de los 6 bloqueantes.

- Cotizaciones (P0): hidratación reactiva del formulario (`values` de RHF) en lugar de `reset()` one-shot — se acabó la pérdida de partidas al navegar lista → detalle → editar. Fallback para cotizaciones legacy sin `rental_meta`.
- Base de datos: nueva función `today_mty()` como única fuente de "hoy"; se reemplazó `CURRENT_DATE` (UTC) en indicadores, `v_overdue_invoices`, alertas, contadores y validaciones.
- Frontend: defaults de fecha en zona horaria de Monterrey (devoluciones, entregas, mantenimiento, CxP, vigencia de cotización).
- CRM: `ProspectHistoryCard` permite el rol Ventas sin exponer el módulo Auditoría.
- Flota: badge del detalle derivado con `computeFleetAvailability`.
- Formularios: guard anti doble submit robusto (liberación con debounce + timeout de seguridad, ahora en `onClick`).
- Rutas: `/customers/new` redirige al alta por diálogo; identificadores no-UUID muestran "no encontrado".

## 7.272.0 — 31/07/2026

Auditoría Ronda 8: permisos restaurados, cierre de OT blindado y detalles de interfaz.

- Base de datos: se recrearon las reglas de lectura perdidas (Mecánico: reservas y extensiones; Ventas: historial de prospectos, acotado a prospectos), se agregó el candado en el servidor que impide cerrar órdenes de trabajo con daños abiertos y un diagnóstico de coherencia de cuentas por pagar.
- Interfaz: tab "Vencido" alineado con el Panel, datos financieros de unidad sólo para roles autorizados, botón "Cerrar OT" bloqueado con daño abierto, edición de cotizaciones sin perder partidas, motivo obligatorio al rechazar cotización, duración cotizada inclusiva, KPIs de cuentas por pagar corregidos, fechas del portal y de inspección en zona horaria de Monterrey, traducciones en bitácora/conciliación/pagos, mejor contraste y objetivos táctiles de 44px.

## 7.261.0 — 29/07/2026

- Cotizaciones: nuevo estado `cancelled` y transición `accepted → cancelled` restringida a admin/administrativo y sin reservas `confirmed` ligadas (DB3-08).
- `guard_quote_delete`: mensaje corregido (cancelar en vez de "rechazar") conservando la exención de teardown E2E (`app.e2e_teardown` + `is_e2e` + `e2e_scope`).
- UI: filtro de estado de cotizaciones incluye "Cancelada".


## 7.260.3 — 29/07/2026

- E2E: `e2e_teardown` marca su ejecución interna para que `guard_quote_delete` permita borrar únicamente cotizaciones `is_e2e` con `e2e_scope`, manteniendo bloqueado el borrado de cotizaciones aceptadas reales.

## 7.260.2 — 29/07/2026

- Refactor: `PortalInvoiceDetail` delega datos y totales a `usePortalInvoiceDetailData` y el resumen a `InvoiceSummaryCards`; se elimina la advertencia de ESLint por complejidad 17.

## 7.260.1 — 29/07/2026

- E2E: `e2e_seed_scenario` siembra la cotización en `draft` y la transiciona a `accepted`, alineándose con el trigger `validate_transition` (13 specs del shard 1/2 volvían a fallar en la siembra).
- Entregas: `validate_delivery_not_in_past` exime a las entregas registradas como `completed` (captura histórica).

## 7.260.0 — 29/07/2026

- DB2-06/07: `change_forklift_status` como flujo oficial de cambio de estado del equipo + guard de tabla; la bandera `is_e2e` deja de servir para evadir auditoría.
- DB2-08/09: notas de crédito con montos positivos y cuadre aritmético; pagos a proveedor exigen aprobación también por PostgREST.
- DB2-10/11: entregas no se pueden mover al pasado; rescatar cotización vencida exige nueva vigencia y no se reenvían cotizaciones caducas.
- DB2-12/19: los daños recuerdan y restauran el estado previo del equipo, no se archivan/borran sin cargo, y la re-inspección con daño nuevo se rechaza explícitamente.
- DB2-13/14/15: `supplier_bills.total` no baja de lo pagado, las partidas cuadran con el subtotal (±0.05) y se rechazan pagos sobre facturas en borrador.
- DB2-16/17/18: dominio de `deliveries.status`, contratos sin tasas/depósito negativos ni fechas incoherentes, y bloqueo de borrado de cotizaciones aceptadas o con reservas.
- DB2-20/21: regresiones `paid→sent/partial` sólo vía sync de pagos; sin lockout del último admin activo y exención e2e limitada a `@liftgo.test`.


## 7.255.0 — 29/07/2026

- R23-G: nueva RPC `reorder_prospect_stage` que reindexa `stage_order` de la columna origen y destino en una sola transacción (sin duplicados `#0`).
- R23-H: el reorder dentro de la misma columna usa `useMoveProspectStage` (optimista + reindexado) en lugar de un update plano.
- R23-I: soltar en el área vacía de una columna coloca la tarjeta al final, no al inicio.
- R23-J: `parseBankCsv` valida el número mínimo de columnas por perfil y reporta el renglón corrido con mensaje accionable.
- R23-F: `useRecordPaymentForm` resetea Referencia/Notas/Método/Fecha/Forma SAT al reabrir y los incluye en `isDirty`.



## 7.254.0 — 29/07/2026

- R23-1: se restauraron 10 celdas de dinero que se renderizaban vacías (proveedores, pólizas, reportes de costos/antigüedad/ingresos y portal) + guard automático `moneyCellRegression.test.ts`.
- R23-2: la vista de impresión libera `height`/`overflow` del shell `h-[100dvh]`, evitando el recorte del contenido.
- R23-A: `FormDialog` expone `requestClose` por contexto; el botón "Cancelar" de `FormActions` respeta el aviso de cambios sin guardar.
- R23-B: `ProspectFormDialog` espera el guardado antes de cerrar y conserva la captura si falla.
- R23-C: `useMoveProspectStage` sólo invalida cuando no quedan movimientos en vuelo (sin rebotes al arrastrar rápido).
- R23-D: KPIs de Cuentas por Pagar usan `kpiSizeClass` para montos largos.
- R23-E: `parseAmount` interpreta correctamente la coma decimal es-MX ("1.500,50" → 1500.50).



## 7.253.4 — 29/07/2026

- Se aisló la limpieza de datos E2E para que las ejecuciones paralelas de CRM y conciliación bancaria no borren escenarios activos.
- La prueba del Kanban ahora espera la confirmación de persistencia antes de recargar la página.
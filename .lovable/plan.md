# Auditoría Round "Bajos" (B-3 … B-15)

Aplicar el paquete de correcciones de severidad baja del diff subido, validando antes cada hallazgo contra el código real. Lo que no se confirme como bug se reporta y no se toca.

## Qué se corrige

**Cierre de sesión (B-4)**
Si falla la red al cerrar sesión, hoy queda una promesa rechazada sin manejar y la caché local del usuario anterior no se limpia. Se garantiza la limpieza siempre y se hace un cierre local como respaldo.

**Cuentas por pagar (B-10)**
El KPI "Pagado mes actual" hoy usa la fecha de emisión de la factura. Pasa a usar la fecha real de pago y a sumar pagos parciales, convertidos a MXN con la moneda y tipo de cambio de la factura.

**Notas de crédito (B-7)**
Sumas de dinero con la utilidad monetaria del proyecto y comparación con tolerancia de medio centavo, para que no se ofrezca crear una nota de crédito de $0.00 por error de redondeo.

**Facturación (B-11)**
Bloquear guardar una factura en moneda distinta a MXN con tipo de cambio 0.

**Calendario (B-13)**
"Hoy" quedaba congelado en sesiones largas (pestaña abierta de un día para otro), afectando el badge de renta activa.

**CRM (B-14)**
Si falla la lectura del orden en el tablero, ya no se asume 0 en silencio: se muestra el error.

**Devoluciones (B-12)**
Las fechas de inspección se muestran y filtran en horario de Monterrey, no en la zona del navegador.

**Exportar CSV (B-5)**
La descarga se cancelaba en Firefox por liberar el archivo demasiado pronto.

**Restauración de scroll (B-6)**
Se acota a 50 entradas para que no crezca sin límite en sesiones largas.

**Timbrado y CFDI (B-15 y ajustes en funciones de servidor)**
Contadores de reintentos para timbrado de complementos de pago y notas de crédito, y manejo de errores homogéneo en cancelaciones e invitaciones.

**Numeradores de folio borrador (B-3)**
Hoy cualquier usuario autenticado puede consumir la secuencia de folios borrador. Se agrega control de rol (admin/administrativo, con excepción para procesos automáticos) sin romper el alta de facturas/NC.

## Detalles técnicos

- Frontend: `AuthContext.tsx`, `useAccountsPayableKpis.ts`, `useSupplierBills.ts` (agrega `payments[]` al listado), `InvoiceCreditNotesCard.tsx`, `computeMaxCreditable.ts`, `invoiceFormSchema.ts`, `EquipmentListView.tsx`, `useProspectMutations.ts`, `ReturnInspectionPage.tsx`, `useMainScrollRestoration.ts`, `exportCsv.ts`, `useQuoteConversionActions.ts`, `quoteFormBuilders.ts`.
- Edge functions: `cancel-credit-note`, `invite-user`, `reconcile-stamping-invoices` (+ redeploy).
- Migraciones: guard de rol en `next_draft_invoice_number`, `peek_next_draft_invoice_number` y equivalentes de nota de crédito; columnas de intentos de timbrado para REP/NC.
- Validación previa: revisar cada archivo objetivo antes de editar; los diffs se aplican como referencia, no a ciegas.
- Pruebas: actualizar `useAccountsPayableKpis.test.ts` y agregar cobertura para `computeMaxCreditable`, validación de tipo de cambio, límite del mapa de scroll y filtro de fechas en Monterrey. Correr typecheck, lint y suite completa.
- Cierre: nueva entrada de changelog (index + detalle) como versión menor `v7.292.0`.

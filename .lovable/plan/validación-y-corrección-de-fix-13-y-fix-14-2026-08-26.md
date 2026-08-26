# Validación y corrección de fix-13 y fix-14

Revisé los 11 hallazgos contra el código actual. Todos corresponden a comportamiento real del repo; ninguno es falso positivo, pero tres necesitan ajustes respecto al diff propuesto.

## fix-13 — Facturación recurrente, meses y daños

| ID | Hallazgo verificado | Acción |
|----|--------------------|--------|
| N-7a | El periodo recurrente siempre cierra a fin de mes; si el contrato termina el día 10, se factura el mes completo | Cortar `billingEnd` en `end_date` y prorratear el último ciclo igual que el primero |
| N-7c | `Number(booking.monthly_rate) \|\| forklift.monthly_rate` reemplaza una tarifa pactada de 0 (cortesía) por la tarifa maestra | Usar comparación contra `null` en vez de `\|\|` |
| N-12 | La bolsa de horas del contrato usa `CEIL(días/30)`, que infla meses en periodos con meses de 31 días | Migración: meses calendario anclados al día de inicio + remanente prorrateado |
| N-13 | La devolución tardía no deja rastro ni cargo sugerido | Migración: columnas `late_days` y `suggested_late_charge` (informativas, no facturan solas) |
| N-37 | Rentas ancladas en día 31 se cobran de más: 31-ene → 30-mar factura 2 meses completos | Corregir `calcMonths` y el inicio del remanente en `rentalCalculation.ts` |
| N-35 | El prefill de "Facturar daño" usa siempre `estimated_cost`, ignorando `actual_cost` de un daño ya reparado | Usar el helper existente `chargeableDamageCost` |

## fix-14 — CFDI, comprobantes y cancelaciones

| ID | Hallazgo verificado | Acción |
|----|--------------------|--------|
| N-8 | El portal del cliente llama `download-cfdi`, que sólo admite admin/administrativo/ventas: el cliente recibe 403 al descargar su propio CFDI | Admitir rol `customer` con verificación de propiedad vía `get_customer_id_for_user` (factura y nota de crédito) |
| N-9 | Los comprobantes y XML de proveedor se guardan como URL firmada de 5 años en la base | Guardar sólo el `path` y firmar al abrir con TTL corto |
| N-10 | Si no hay API key del PAC, la cola de reintentos re-timbra a ciegas (riesgo de CFDI duplicado ante el SAT) | Diferir con `next_retry_at` en vez de re-timbrar |
| N-11 | Una cancelación rechazada o expirada por el SAT deja el documento imposible de reintentar; un `pending` huérfano lo bloquea para siempre | Admitir `rejected`/`expired` en el claim y resetear `pending` viejo (>72 h) |
| N-44 | `Content-Disposition` usa el nombre sin sanear (inyección de encabezado) y la descarga no tiene límite de tasa | Sanear el nombre y aplicar `enforceRateLimit` (30/min) |

## Ajustes respecto al diff propuesto

1. **N-9 (compatibilidad hacia atrás).** Ya existen filas con URLs firmadas completas guardadas en `receipt_url` y `cfdi_xml_url`. El diff rompería esos registros. Al leer, se detectará si el valor empieza con `http` y en ese caso se abrirá tal cual; sólo los valores nuevos (path) se firmarán on-demand. Sin backfill ni cambios al pasado.
2. **N-11 (columna inexistente).** `invoices` no tiene `cancellation_requested_at`. El cálculo de antigüedad del `pending` usará `updated_at`, que sí existe.
3. **N-37 (riesgo alto).** Es el cambio más delicado: toca el cálculo de renta que alimenta cotizaciones, contratos y facturas. Se implementará junto con casos de prueba nuevos (31-ene→30-mar, 31-ene→28-feb, 31-ene→31-mar, mes completo normal) y se verificará que la suite existente siga pasando antes de cerrar.

## Detalles técnicos

- Frontend: `src/lib/domain/rentalCalculation.ts`, `src/features/invoices/hooks/useDamagePrefill.ts`, hooks y componentes de `src/features/accounts-payable` (`useUploadSupplierReceipt`, `useUploadSupplierBillXml`, `RegisterSupplierPaymentDialog`, `SupplierBillFormDialog`, `SupplierPaymentRow`).
- Edge functions: `generate-recurring-invoices`, `download-cfdi`, `process-cfdi-retry-queue`, `cancel-cfdi`, `refresh-cancellation-status`.
- Migración nueva para N-12/N-13 sobre `complete_return_inspection`, cumpliendo las reglas permanentes de SQL (`SET search_path`, guards de rol, `REVOKE` a `anon`, `GRANT` explícito) y `scripts/lint-migrations.ts`.
- Pruebas: casos nuevos para `calculateRentalCost`, prorrateo de fin de contrato y prefill de daños; smoke SQL para la inspección de devolución.
- Changelog: entrada nueva (minor) en `public/changelog.json` y `CHANGELOG.md`.

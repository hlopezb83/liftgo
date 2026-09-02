# Correcciones liftgo — 6 fixes de auditoría (fases 1–4)

Verifiqué en código y base de datos los 6 hallazgos del documento: los 6 son reales y el diagnóstico es correcto. Se implementan en el orden sugerido.

## Qué se corrige (en lenguaje simple)

1. **Cancelar una factura ya no bloquea re-facturar el mismo periodo.** Hoy, si cancelas la factura de un periodo de una reserva, el sistema se niega a emitir otra del mismo periodo con un error técnico. Confirmado: el índice actual no excluye canceladas.
2. **Misma tarifa por dos caminos.** Una reserva con tarifa diaria guardada en 0 factura en $0 al facturar desde reserva, pero sí usa el precio de catálogo al facturar una extensión. Se unifica la regla ("la pactada gana solo si es > 0").
3. **El IVA del cliente se respeta en la factura manual.** El motor recurrente ya usa `customers.tax_rate` (la columna existe), pero el formulario manual siempre pone 16 y ni siquiera lee la columna. Se lee, se aplica al seleccionar cliente y se hace editable en la ficha del cliente.
4. **Seguro y logística se cobran una sola vez.** Hoy cada factura manual de la misma reserva vuelve a pre-cargar esos cargos únicos (riesgo de doble cobro), y el motor recurrente nunca los cobra.
5. **Candado de edición de cotizaciones.** El bloqueo optimista usa la versión "viva", así que un refresco en segundo plano permite pisar los cambios de otro usuario. Se congela la versión al abrir el formulario, igual que ya se hizo en facturas y clientes.
6. **Dashboard consistente en dólares.** El desglose por estatus suma facturas USD con tipo de cambio = 1 como si fueran pesos, mientras el resto del panel las excluye. Se aplica la regla canónica de FX y el formulario deja de aceptar TC = 1 en moneda extranjera.

## Detalles técnicos

**FIX-1** — Migración nueva `..._fix_uniq_invoices_recurring_period_excludes_cancelled.sql`: recrea el índice único añadiendo al predicado `status <> 'cancelled'` y `COALESCE(cancellation_status,'') <> 'accepted'`. Actualizar el copy en `src/lib/errors/pgErrorCatalog.ts:77`.

**FIX-2** — Nuevo `src/lib/domain/bookingRates.ts` con `resolveBookingRates(booking, catalog)` (regla `> 0`). Consumirlo en `buildLinesForBooking` (`useInvoiceFormHandlers.ts`) y en `resolveExtensionRates` (`extensionBilling.ts`), conservando la firma pública `{ daily, weekly, monthly }`. Tests unitarios del helper y de la paridad entre ambos caminos.

**FIX-3** — Añadir `tax_rate` a `CUSTOMER_LIST_COLUMNS` y `CUSTOMER_DETAIL_COLUMNS` en `useCustomers.ts`; aplicar la tasa en `handleCustomerSelect` y `applyPrimaryCustomer` con la semántica de `resolveVatRatePercent` (no finito → 16; 0 explícito se respeta); campo numérico 0–100 en el formulario de cliente (`customerFormSchema.ts` + su componente) y en `customerPayload.ts`. La columna ya existe; no se crea nada en base de datos.

**FIX-4** — Existen ambos caminos de vínculo factura↔reserva: `invoices.booking_id` y la tabla puente `invoice_bookings`. La consulta de "extras ya facturados" cubrirá los dos, filtrando `status <> 'cancelled'` y `cancellation_status <> 'accepted'`, y reusando `isRentalOrSaleLine` de `nonRentalLines.ts` (se exportará; hoy es privada). El prefill de extras se omite por `quote_id` cuando ya se facturaron; sigue siendo editable. En `generate-recurring-invoices/index.ts`, anexar las partidas no-renta de la cotización origen solo cuando ninguna factura vigente de la reserva las incluya, con las mismas claves SAT (84131500 / 78101800, E48, objeto_imp "02").

**FIX-5** — En `useQuoteFormLogic.ts`: `useState` + `useEffect` para congelar `version` (reset por `id`, refresco tras update propio), replicando el patrón de `useInvoiceFormLogic`.

**FIX-6** — Migración nueva `..._fix_dashboard_stats_fx_is_missing.sql` con `CREATE OR REPLACE FUNCTION get_dashboard_stats` copiando la definición vigente y cambiando solo el CASE del breakdown a `NOT public.fx_is_missing(moneda, tipo_cambio)`. En `invoiceFormSchema.ts`, exigir TC > 0 **y** ≠ 1 para moneda ≠ MXN.

## No se toca

Migraciones ya aplicadas, `src/components/ui`, `computeTotals`, `calculateRentalCost`, `generateLineItems`, `prorateMonthlyLine`, `fx_is_missing`, `v_invoices_with_balance`, `useUpdateQuote`, y ninguna regla de RLS, state machine o guard de RPC.

## Verificación

Por cada FIX: tests existentes + nuevos unitarios donde aplique, typecheck, build, y las consultas SQL de verificación del documento (`pg_indexes` para FIX-1, breakdown vs `v_invoices_with_balance` para FIX-6). Al cierre, entrada nueva en el CHANGELOG (versión minor, agrupando los 6 fixes).

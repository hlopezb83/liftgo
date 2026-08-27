# fix-25.diff — conciliación bancaria y bloqueo optimista en facturas

Verifiqué el diff contra el código actual: los cinco hallazgos son reales y ninguno está aplicado todavía. También quedan dos pendientes de fix-24 que arrastro a esta misma versión.

## Hallazgos de fix-25 (confirmados)

1. **R4-22 — El indicador de conciliación no se refresca.** Conciliar, desemparejar o ignorar un movimiento (individual o en lote) solo refresca la lista de movimientos; el sello de "conciliado" que se muestra en pagos sigue mostrando el dato viejo hasta recargar la página. Se agregará ese refresco a las cinco acciones.
2. **R4-23 — El historial de importaciones no muestra la importación recién hecha.** Al subir un estado de cuenta solo se refrescan las líneas; el listado de importaciones no. Se agregará el refresco, igual que ya hace la acción de borrar importación.
3. **R4-24 — Estadísticas por importación subestimadas.** La consulta de líneas por importación no lleva tope explícito, así que el servidor corta en ~1000 filas en silencio y los contadores "conciliadas / total" salen bajos en cuentas con mucho movimiento. Se agrega un tope alto explícito.
4. **R4-29 — Lista de movimientos truncada sin aviso.** La página de conciliación muestra el aviso de truncado siempre que se dispare la condición interna del componente, pero el hook no expone la bandera; se expondrá `isTruncated` y la página mostrará el aviso solo cuando realmente se alcanzó el tope.
5. **R4-25 — Dos usuarios editando la misma factura.** La edición de facturas no valida versión: el último en guardar pisa los cambios del otro sin avisar. Se agrega bloqueo optimista igual al que ya usan Clientes y Montacargas, con mensaje claro de "el registro cambió, recarga".

## Pendientes heredados de fix-24

6. **Apagar el sembrado E2E en la fila existente**: la configuración de la empresa todavía lo tiene activado; solo se cambió el valor por omisión.
7. **Restringir tipos de archivo en comprobantes de pago**: reforzar la lista blanca (PDF, JPEG, PNG, WebP) en el flujo de carga, ya que el límite por tipo no puede fijarse a nivel de bucket desde aquí.

## Detalles técnicos

- R4-22: agregar `reconciliationStatusQueries.keys.all` a `invalidateKeysFn` en `useBankLineActions.ts` (confirm/unmatch/ignore) y `useBankBulkActions.ts` (confirmMany/ignoreMany).
- R4-23: agregar `bankImportKeys.all` en `useImportBankStatement.ts`.
- R4-24: constante `IMPORT_LINES_STATS_LIMIT = LIST_FETCH_LIMIT * LIST_FETCH_LIMIT` y `.limit(...)` en la consulta de `bank_statement_lines` de `useBankStatementImports.ts`.
- R4-29: `useBankStatementLines` devuelve `{ ...query, isTruncated: hasReachedListLimit(query.data) }`; `BankReconciliationPage.tsx` renderiza `ListTruncationNotice` condicionado a esa bandera.
- R4-25: `useUpdateInvoice` acepta `expectedVersion` opcional, aplica `.eq("version", expectedVersion)`, y distingue conflicto de concurrencia de "no existe / sin permiso" con una relectura; `useInvoiceFormLogic` expone `invoiceVersion` y `InvoiceForm.tsx` lo envía. Sin `expectedVersion` el comportamiento actual se conserva.
- Punto 6: `UPDATE public.company_settings SET allow_e2e_seed = false WHERE allow_e2e_seed` con la herramienta de datos.
- Punto 7: validación de tipo MIME en `useCreatePaymentIntent.ts` antes de subir.
- Cierre: versión **7.355.0** (minor), entrada de changelog y verificación con Vitest y build.

## Plan de remediación — Auditoría R (M-2..M-13, C-3, C-6)

Aplico los 12 fixes tal cual la tabla, con adaptaciones donde la ubicación real del código difiere del reporte. Estimo v7.240.0 (minor por acumulación de bugs de comportamiento y visibilidad).

### Frontend

**M-2 · Bill aprobada no aparece en "Exportar pagos"**
- `src/features/accounts-payable/hooks/useBillApprovalMutations.ts`: agregar `exportablePayableQueries.keys.all` (import desde `./useExportablePayables`) al array `invalidationKeys`. Aplica a los 3 mutations (approve/reject/reapproval).
- Extender `useBillApprovalMutations.test.ts` con un caso que verifique que `queryClient.invalidateQueries` incluye la key.

**M-3 · Pago CxP no baja "POR PAGAR" en flujo de caja**
- `src/features/accounts-payable/hooks/useRegisterSupplierPayment.ts`: importar `cashFlowProjectionQueries` desde `@/features/cash-flow/lib/queryKeys` y agregar `cashFlowProjectionQueries.keys.all` al `invalidateKeysFn`.

**M-4 · Bills `not_required` invisibles en lote**
- `src/features/accounts-payable/hooks/useExportablePayables.ts` L44: cambiar `.eq("approval_status", "approved")` por `.in("approval_status", ["approved", "not_required"])`.

**M-6 · Toast "Error desconocido" + duplicado en transición inválida**
- `src/features/bookings/hooks/bookingActions/useBookingActions.ts` L60-62: usar `getErrorMessage(err)` (de `@/lib/errors`) para mostrar el mensaje SQL traducido.
- Verificar que no salga toast duplicado desde `useUpdateBooking`/`useCancelBooking` (`useEntityMutation` con `errorTitle`). Si sí, suprimir el toast local del `catch` o pasar `{ silent: true }` según la API disponible; una sola notificación al final.

**M-9 · Clobber de inputs al editar contrato**
- `src/features/contracts/hooks/contractForm/useContractFormState.ts` L54: `form.reset(mapContractToForm(existing), { keepDirtyValues: true })`.

**M-10b · Badge de contrato dice "Sin Pagar" para `sent`**
- `StatusBadge` ya acepta prop `label`. En `ContractsPage.tsx` (tabla + `mobileCardRender`) y `ContractDetail.tsx`: `<StatusBadge status={c.status} label={CONTRACT_STATUS_LABELS[c.status]} />`.

**M-11 · Cotización con `rental_meta` legacy no guarda**
- `src/features/quotes/hooks/quoteForm/useQuotePrefill.ts` `getRentalMeta`: normalizar cada elemento con defaults antes de retornarlo (`discount ?? 0`, `discountType ?? "%"`, `quantity ?? 1`, tarifas `?? 0`). Test unitario con meta legacy sin `discount`.

**M-12 · Factura con cancelación aceptada sigue mostrando "Cancelar CFDI"**
- `src/lib/rules/invoices.ts` L56: el guard ya existe (`cancellationStatus !== "accepted"`). Revisar cómo llega la data: en detalle la mayoría de facturas aceptadas ya tienen `status='cancelled'` y `cfdi_status='cancelled'`, pero si no, `computeCfdiFlags` no marca `isCancelled` cuando solo hay `cancellation_status='accepted'`. Fix: incluir `cancellationStatus === "accepted"` en el cómputo de `isCancelled`.
- UI: en `InvoiceDetail` añadir badge "Cancelada" cuando `isCancelled` o `cancellationStatus==="accepted"` para evidencia visual.

**M-13 · Rol auditor ve controles admin en /users**
- `src/features/users/pages/UserManagementPage.tsx`: envolver botón "Crear Usuario" en `RoleGuard`/`useHasModuleAccess("Gestión de Usuarios","full")`. En `useUserManagementColumns` ocultar columnas rol-select y toggles cuando `!canFull`.

**C-3 · Toast de devolución contradice estado real**
- `src/features/returns/hooks/returnInspection/useReturnInspectionDialog.ts` L78-82: alinear con el RPC — `goesToMaintenance = ["major_damage", "needs_repair"].includes(values.condition)`. Quitar `minor_damage` y quitar la disyunción `damageCost > 0`.

**C-6 (F-07) · Entregas no validan coherencia forklift↔booking ni tocan estado**
- `DeliveryFormFields.tsx`: al seleccionar `bookingId`, filtrar `forkliftOptions` a las del booking (`booking.forklift_id`) y viceversa; validar en `deliveryFormSchema` cuando ambos existan.
- `useDeliveryCompletion.markComplete`: si `type==="delivery"` y hay booking, disparar transición de flota a `rented` vía RPC/hook existente (`change_forklift_status`) cuando el equipo aún esté `available`. Para `pickup` liberar a `available` si no hay otras reservas activas (idempotente).

### Backend

Sin migraciones. Todo es TypeScript + query keys + validaciones cliente.

### Tests

- `useBillApprovalMutations.test.ts`: assert de invalidación de `exportable_payables`.
- Test unitario nuevo `useQuotePrefill.legacyMeta.test.tsx` para M-11.
- E2E opcional para M-6 (toast contiene traducción).

### Changelog & Memory

Nueva entrada v7.240.0 en `public/changelog.json` + detalle en `public/changelog/v7.240.0.json`.

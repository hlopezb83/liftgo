
# R7 · Validación y corrección por bloques

Revisé el reporte contra el código real. Confirmo que la mayoría son bugs reales, con algunos matices. Propongo ejecutar en 4 fases, cada una con su bump de changelog y verificación (`tsgo`, `vitest`, build).

## Validación previa (spot-checks realizados)

| Bloque | Estado | Notas |
|---|---|---|
| 1a form.tsx | ✅ Bug real | `useFormField` lee `formState` en render sin suscripción reactiva. Con React Compiler activo se memoiza y los errores no re-renderizan. |
| 1b EquipmentDetailsSection | ✅ Bug real | Línea 21 usa `watch("manufacturer")` en render. |
| 2 FeedbackFormDialog | ✅ Bug real | Falta `<Form {...form}>`; `TextField/TextareaField` internos usan `FormField` shadcn que llama `useFormContext()` → crash. |
| 3 FormActions doble submit | ⚠️ Parcial | Ya bloquea con `isSubmitting`; falta capa `onPointerDown` + guarda reentrada en `useEntityMutation`. |
| 4 RoleGuard treasury | ✅ Bug real | Confirmado copy-paste de `module="Facturas de Proveedor"` en 3 páginas. |
| 5–20 (altos/medios) | Pendiente validar en su fase | Se validan al inicio de cada fase antes de aplicar. |

## Fase 1 — Críticos (Bloques 1-4)

**Objetivo:** desbloquear formularios, feedback, doble submit y tesorería.

- **1a** `src/components/ui/form.tsx`: en `FormMessage`, `FormLabel`, `FormControl` sustituir el `error` derivado de `useFormField()` por una suscripción reactiva con `useFormState({ control, name })` (accediendo al error por path `name.split(".")`). Mantener API pública.
- **1b** `EquipmentDetailsSection.tsx:21`: `watch("manufacturer")` → `useWatch({ control, name: "manufacturer" })`.
- **1c** Barrido `rg "= watch\(" src/` y migrar cada ocurrencia en render a `useWatch`.
- **2** `FeedbackFormDialog.tsx`: envolver el `<form>` en `<Form {...form}>`. Añadir test que monte el diálogo.
- **3** `FormActions`: añadir `onPointerDown` que bloquea si `busy`. En `src/lib/hooks/useEntityMutation.ts` añadir guarda de reentrada (`if (mutation.isPending) return`).
- **4a** Corregir `module="..."` en `CashFlowPage`, `BankAccountsPage`, `BankReconciliationPage` al string real de la matriz (revisar `role_permissions` seed vigente y `ROUTE_TO_MODULE`).
- **4b** Migración SQL: seed en `role_permissions` para `Facturas de Proveedor` (clonando niveles del módulo original si existe; explícito por rol si no).

Bump: v7.164.0.

## Fase 2 — Altos (Bloques 5-10)

- **5** `RevenueReport`: filtrar `status !== 'draft' && status !== 'cancelled'` antes de agregar; aplicar a CSV.
- **6** `useAccountsPayableKpis` + `useAgingReport`: normalizar a MXN con `balance * exchange_rate` (o `balance_mxn` si existe), en KPIs y buckets. Etiquetar totales "(MXN)".
- **7** Cotización vencida: deshabilitar botón Aceptar en `QuoteDetailActions` si `parseDateLocal(valid_until) < hoy`; migración con trigger o mover a RPC con guarda; setear `accepted_at`/`accepted_by`.
- **8** Botones Editar/Nuevo/Eliminar/Invitar en Clientes → envolver con `RoleGuard` (write/full). Hardening RLS mínimo (policies separadas por operación).
- **9** `customerFormToUpdate`: añadir `razon_social: values.name` sincronizado con `name`.
- **10a** Zod en `forkliftFormSchema` (`coerce.number` + rangos) + migración `CHECK` en `forklifts`.
- **10b** RPC `change_forklift_status(forklift_id, new_status, reason)` con reglas de transición y `status_logs`.

Bump: v7.165.0.

## Fase 3 — Medios (Bloques 11-20)

- **11** Badges `stamping` y `error` en `InvoiceDetailBadges` + nota en detalle.
- **12** Timbrar: guarda reentrada + 409 como no-error.
- **13** Etiquetas MXN/USD en PDF estado de cuenta, historial de pagos, preview extensión, detalle cliente y listado de facturas.
- **14** Prellenar TC del pago con el de la factura en `useRecordPaymentForm` y persistir.
- **15** Devoluciones: `new Date(inspected_at)` para timestamps; `parseDateLocal(end_date)` para comparación diaria. Test TZ Monterrey.
- **16** Ajustar tokens `--destructive` a `0 72% 45%` (light) / `0 72% 50%` (dark).
- **17a** Botones descargar PDF/XML en `PortalInvoiceDetail`. **17b** `AuthGuard` + `AppProviders`: esperar `useIsRestoring()` y rol resuelto antes de renderizar `*`.
- **18** `ContractForm`: filtrar a `status='available'` (más el actual si edita). Badges vencido/por vencer.
- **19** Cotizaciones/Modelos: mensaje de error real en partidas, badge "Vencida", validación duplicado fabricante+modelo, `accept`+límite en adjuntos.
- **20** Migración: guarda en `cancel_booking` para estados terminales.

Bump: v7.166.0.

## Fase 4 — Bajos (Bloque 21, 17 items)

Batch de pulido: `RoleGuard fallback={null}`, `ROUTE_TO_MODULE`, unique parcial en `customers.rfc`, aviso pre-eliminar cliente, tope 100% descuento, filtro CFDI en listado facturas, diálogo error SAT, motivo 01 UUID validation, mensajes duplicado específicos, dashboard skeleton, RevenueReport eje Y, ChangelogEntryCard `<button>` anidado, mapeo `SERVICE_TYPES`, `CHECK` en `maintenance_parts`, decisión back-to-back mismo día (proponer `'[)'`).

Bump: v7.167.0.

## Detalles técnicos

- Verificación por fase: `bunx tsgo`, `bunx vitest run`, build, y test manual del criterio de aceptación del bloque.
- Cada migración pasa `supabase--linter`.
- Cada fase agrega entrada en `public/changelog.json` + `public/changelog/v7.X.Y.json` con SOLO lo aplicado.
- No re-introducir patrones prohibidos del checklist (watch en render, `<FormField>` sin `<Form>`, `formatCurrency` sin moneda, `parseDateLocal` sobre timestamps, `new Date(dateOnly)` para comparaciones).

Confírmame si arranco por Fase 1 o si prefieres otro orden/subconjunto.

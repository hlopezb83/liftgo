
# Oleada 1 UI/UX — 13 quick wins

Aplicar el spec `liftgo-instrucciones-uix-ola1.md` tal cual, en el orden numerado A-1 → A-13. Antes de cada edit, leer el archivo real para verificar líneas y evitar duplicados (varios diffs advierten sobre esto).

## Cambios (uno por punto)

1. **A-1 · STATUS_LABELS** — Agregar `out_of_service, preventive, corrective, inspection, in_transit, damaged, maintenance_required` en `src/lib/constants.ts`. Auditar PDFs bajo `src/lib/pdf/` que armen status a mano y cambiarlos por `STATUS_LABELS[status] ?? status`.
2. **A-2 · Auditoría labels** — En `auditTrailLabels.ts` agregar tablas (`supplier_bills`, `parts_inventory`, `user_roles`, `suppliers`, `prospects`, `supplier_payment_batches`) y campos (`cfdi_status`, `stock_quantity`, `exchange_rate`, `payment_in_progress_at`, `cancellation_status`, `signed_at`, `work_order_number`, `service_type`, `hours_reading`, `company_name`). Revisar duplicados.
3. **A-3 · CxP approval → pill** — En `supplierBillColumns.tsx` reemplazar `<div>` por `<StatusBadge tone={approvalTone(st)}>` con mapa approved→success, pending_approval→warning, rejected→error, not_required→neutral.
4. **A-4 · "Timbrada" verde en detalle** — `InvoiceDetailBadges.tsx`: `tone="info"` → `tone="success"`.
5. **A-5 · PDF IVA** — `TotalsBox.tsx`: normalizar `taxRate < 1 ? taxRate*100 : taxRate`.
6. **A-6 · Badges en una línea** — `StatusBadge.tsx`: agregar `whitespace-nowrap`.
7. **A-7 · Truncar nombres largos** — Aplicar patrón `truncate + Tooltip` a la columna principal en `forkliftColumns`, `contractColumns`, `damageColumns`.
8. **A-8 · Zebra uniforme central** — `DataTableBodyV2.tsx`: agregar `rowIndex % 2 === 1 && "bg-muted/40"`. Buscar y remover zebra ad-hoc por página para no duplicar.
9. **A-9 · Copys toasts** — Buscar con grep en `contracts`/`invoices` los "correctamente." / "Exitosamente" y normalizar a patrón acción+entidad sin punto.
10. **A-10 · Contador "0 clientes"** — `CustomersPage.tsx`: `customers ? ... : undefined`. Replicar en quotes/fleet/suppliers/invoices.
11. **A-11 · Toast global humano** — `AppProviders.tsx`: `notifyError` con `title: "No se pudo cargar la información"`.
12. **A-12 · TableSkeleton rows prop** — Añadir prop `rows` (default 5), pasar el pageSize real en páginas paginadas de 25.
13. **A-13 · Input file en español** — `BankStatementUploader.tsx`: input oculto + Button "Elegir archivo…" con nombre seleccionado.

## Cierre

- Actualizar `public/changelog.json` + `public/changelog/v7.241.0.json` como último paso (minor, 13 mejoras UI/UX).
- Verificar con `bun run lint` y `tsgo` al final.

## Fuera de alcance

No refactor de lógica de negocio. Solo presentación y copys. Si algún archivo divergió del path del spec, ajustar al path real y notar en el changelog.

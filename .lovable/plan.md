## Objetivo
Mostrar en el detalle de cada factura (`/invoices/:id`) un historial completo de todos los cambios que ha sufrido (creación, actualizaciones de campos, timbrado, pagos, cancelación, etc.), aprovechando la bitácora de auditoría ya existente (`audit_logs`).

## Contexto encontrado
- Ya existe la tabla `audit_logs` con `old_data`, `new_data` y `changed_fields`, y triggers que registran INSERT/UPDATE/DELETE de `invoices`.
- Existe el hook `useAuditLogs({ table_name, record_id })` que ya enriquece con el nombre del usuario.
- Patrón de referencia: `BookingStatusHistory.tsx` (timeline simple) y la página `/audit` (vista global).
- `InvoiceDetail.tsx` aún no muestra ningún historial.

## Cambios

### 1. Nuevo componente `src/components/invoice-detail/InvoiceHistoryCard.tsx`
- Recibe `invoiceId`.
- Usa `useAuditLogs({ table_name: "invoices", record_id: invoiceId })`.
- Render tipo timeline (consistente con `BookingStatusHistory`) mostrando, por cada entrada:
  - Acción traducida (Creación / Actualización / Eliminación) usando los mapas de `activityTranslations.ts`.
  - Fecha y hora `dd/MM/yyyy HH:mm` (timezone Monterrey vía `nowMty`/`format`).
  - Usuario (`user_email` / `full_name`).
  - Para UPDATE: lista compacta de campos modificados con diff `antes → después`, formateando valores especiales:
    - `status`, `cfdi_status` → `<StatusBadge>`.
    - `total`, `subtotal`, `tax_amount`, `paid_at`, `due_date` → `formatCurrency` / `formatDateDisplay`.
    - Campos largos (`cfdi_xml`, `line_items`, `notes`) → mostrar solo "actualizado" sin volcar el contenido.
  - Botón opcional "Ver detalle" que abre el `AuditLogDetailDialog` ya existente para inspección completa (reutilización, sin duplicar UI).
- Estados: loading (skeleton corto), vacío ("Sin cambios registrados").
- Colapsable: mostrar las 5 entradas más recientes y un botón "Ver más" (usa `Collapsible` ya disponible) para no saturar la vista.

### 2. Diccionario de etiquetas de campos
Agregar a `src/lib/activityTranslations.ts` (o crear `src/lib/auditFieldLabels.ts` si conviene aislarlo) un mapa `INVOICE_FIELD_LABELS` con traducciones es-MX para los campos clave: `status`, `cfdi_status`, `total`, `subtotal`, `tax_amount`, `tax_rate`, `paid_at`, `due_date`, `notes`, `cancellation_reason`, `cancelled_at`, `cfdi_uuid`, `metodo_pago`, `forma_pago`, `uso_cfdi`, etc. El componente lo consume para etiquetar el diff.

### 3. Integración en `src/pages/InvoiceDetail.tsx`
- Importar `InvoiceHistoryCard` y renderizarlo después de `InvoicePaymentSummary` (antes del bloque de `CollectionNotesCard`), pasando `invoiceId={id}`.

### 4. Changelog
- Crear `public/changelog/v5.59.1.json` (patch — nueva sub-funcionalidad de visualización, sin cambios de schema ni breaking changes) con título "Historial de cambios en facturas".
- Agregar la entrada al inicio de `public/changelog.json`.

## Sin cambios necesarios
- No se requiere migración: las RLS de `audit_logs` ya permiten lectura a admin/administrativo/auditor/dispatcher/ventas, que son los roles con acceso al módulo de facturas.
- Reutilizamos `useAuditLogs`, `AuditLogDetailDialog`, `StatusBadge`, `formatCurrency`, `formatDateDisplay`.

## Validación
- Abrir una factura existente con varios cambios (status draft → issued → paid, registro de pago, etc.) y verificar que cada evento aparece con su diff y usuario.
- Confirmar que una factura recién creada muestra solo la entrada de "Creación".
- Verificar que un usuario con rol `auditor` puede ver el historial (read-only).

¿Procedo con esta implementación?
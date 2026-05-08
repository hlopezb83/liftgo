## Objetivo
Mostrar dentro del side panel de cada prospecto un historial detallado de cambios (creación, actualizaciones de campos, cierre, reapertura) con quién, cuándo y diff antes/después, reutilizando la infraestructura existente de `audit_logs` (la tabla `prospects` ya tiene `prospects_audit_trigger`).

## Cambios propuestos

1. **Nuevo componente `src/components/crm/ProspectHistoryCard.tsx`**
   - Basado 1:1 en `InvoiceHistoryCard` (mismo patrón visual y UX ya validado en facturas).
   - Recibe `prospectId` y consulta `useAuditLogs({ table_name: "prospects", record_id: prospectId })`.
   - Resumen por entrada: acción (Creación/Actualización), usuario, fecha (DD/MM/YYYY HH:mm America/Monterrey), y lista de campos modificados con `valor anterior → valor nuevo` traducidos al español vía `translateField`.
   - Campos largos/poco útiles ocultos del resumen (ej. `stage_order`, `updated_at`); se muestran solo "actualizado".
   - Botón ojo para abrir `AuditLogDetailDialog` con el diff completo.
   - Vista colapsable: 5 entradas iniciales + "Ver N más".

2. **`src/components/crm/ProspectDetailSheet.tsx`**
   - Insertar `<ProspectHistoryCard prospectId={prospect.id} />` debajo del bloque "Creado por / Creado / Actualizado", separado por `<Separator />`.
   - Sin tocar lógica existente (acciones, cierre, etc.).

3. **Traducciones de campos de prospectos**
   - Extender `auditTrailConstants.tsx` (`translateField`) para incluir etiquetas en español de campos de prospectos: `company_name`, `contact_person`, `email`, `phone`, `deal_value`, `stage`, `notes`, `quote_id`, `closed_at`, `lost_reason`, `final_amount`, `stage_order`.
   - Para `stage` y `lost_reason` mostrar el label legible (usando `STAGE_LABELS` / `LOST_REASON_LABELS`) en el resumen cuando el valor coincida con una clave conocida.

4. **Changelog v5.65.3** (`public/changelog/v5.65.3.json` + entrada en `public/changelog.json`)
   - "Historial de cambios en el panel de prospecto del CRM".

## Detalles técnicos
- No requiere migraciones: `prospects_audit_trigger` ya escribe en `audit_logs`, y RLS permite a admin/administrativo/auditor/dispatcher/ventas leer.
- Reutiliza `useAuditLogs`, `AuditLogDetailDialog`, y `translateAction/translateField` existentes.
- Respeta el patrón de zebra/compacto y `formatTimestamp` ya usado para mantener coherencia con InvoiceDetail.

## Fuera de alcance
- No se agrega historial en otras pantallas del CRM (pipeline/kanban).
- No se modifica el trigger ni la estructura de `audit_logs`.
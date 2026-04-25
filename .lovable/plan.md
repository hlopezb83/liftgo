## Plan: Refactor Crítico de Páginas Detail (Pasos 1-3)

Objetivo: reducir complejidad ciclomática <15 en `InvoiceDetail.tsx` (44), `QuoteDetail.tsx` (33) y `ReturnInspectionDetail.tsx` (27) extrayendo lógica a hooks orquestadores y componentes modulares.

### Paso 1 — InvoiceDetail.tsx (Complexity 44 → <15)
**Crear:**
- `src/hooks/invoiceDetail/useInvoiceDetailActions.ts` — orquestador que agrupa acciones (pago, cancelación CFDI, timbrado, edición, eliminación).
- `src/components/invoice-detail/InvoiceDetailActions.tsx` — botones del header (timbrar, cancelar, descargar PDF, eliminar).
- `src/components/invoice-detail/InvoiceSourceLinks.tsx` — links a documentos origen (booking/contract/quote).

**Modificar:** `src/pages/InvoiceDetail.tsx` para consumir el hook y los nuevos componentes.

### Paso 2 — QuoteDetail.tsx (Complexity 33 → <15)
**Crear:**
- `src/components/quotes/QuoteDetailActions.tsx` — acciones del header (PDF, convertir, editar, eliminar).
- `src/components/quotes/QuoteConversionDialogs.tsx` — agrupador de los 3 diálogos de conversión (recurring, customer reassign, equipment assignment).

**Modificar:** `src/pages/QuoteDetail.tsx` para usar componentes agrupados (ya existe `useQuoteDetailLogic`).

### Paso 3 — ReturnInspectionDetail.tsx (Complexity 27 → <15)
**Crear:**
- `src/components/return-inspection/InfoRow.tsx` — fila reutilizable label/value.
- `src/components/return-inspection/EquipmentCard.tsx`
- `src/components/return-inspection/BookingCard.tsx`
- `src/components/return-inspection/InspectionCard.tsx`
- `src/components/return-inspection/UsageFuelCard.tsx`
- `src/components/return-inspection/DamagesCard.tsx`

**Modificar:** `src/pages/ReturnInspectionDetail.tsx` para componer las cards.

### Verificación
- `bunx tsc --noEmit` — confirmar 0 errores.
- Smoke check de los archivos modificados.

### Changelog
Agregar entrada **v5.34.0 (minor)** en `public/changelog.json`: "Refactor arquitectónico: reducción de complejidad en páginas Detail de Factura, Cotización e Inspección de Devolución mediante extracción a hooks orquestadores y componentes modulares".

### Fuera de alcance
Pasos 4-13 del audit (sub-tabs CompanySettings/CRM, BookingDetail, reorganización de 65 hooks flat, eliminación de `any`, CI). Quedan para iteraciones futuras.
# `src/lib/domain/` — constantes y helpers de dominio

**Regla:** aquí solo vive lo genuinamente **cross-domain** (usado por 3+
features distintas).

Auditado en v6 (P3-8). Estado actual:

**Genuinamente cross-domain (mantener aquí):**
- `invoiceHelpers`, `invoiceTotals`, `lineItems`, `rentalCalculation` — matemática monetaria
- `roles`, `templateUtils`, `activityTranslations` — utilidades compartidas
- `errorCatalog`, `satCatalogs` — catálogos globales

**Migrados al feature dueño en v7.179.0 (P3-8):**
- `creditNoteMotives` → `@/features/invoices/lib/creditNoteMotives`
- `paymentIntentStatus` → `@/features/invoices/lib/paymentIntentStatus`
- `feedbackMessages` → `@/features/feedback/lib/feedbackMessages`

**Devueltos a `lib/domain` en v7.213.0 (Lote D) para romper `lib → features`:**
- `contractTypes` — consumido por `lib/pdf/contract` (renderers PDF).
- `customerTypes` — consumido por `lib/pdf/documents/CustomerStatementDocument`.

Los archivos originales en `features/*/lib` sobreviven como re-export shims
para no forzar migración de todos los consumers en un solo lote.


# `src/lib/domain/` — constantes y helpers de dominio

**Regla:** aquí solo vive lo genuinamente **cross-domain** (usado por 3+
features distintas).

Auditado en v6 (P3-8). Estado actual:

**Genuinamente cross-domain (mantener aquí):**
- `invoiceHelpers`, `invoiceTotals`, `lineItems`, `rentalCalculation` — matemática monetaria
- `roles`, `templateUtils`, `activityTranslations` — utilidades compartidas
- `errorCatalog`, `satCatalogs` — catálogos globales

**Migrados al feature dueño en v7.179.0 (P3-8):**
- `contractTypes` → `@/features/contracts/lib/contractTypes`
- `customerTypes` → `@/features/customers/lib/customerTypes`
- `creditNoteMotives` → `@/features/invoices/lib/creditNoteMotives`
- `paymentIntentStatus` → `@/features/invoices/lib/paymentIntentStatus`
- `feedbackMessages` → `@/features/feedback/lib/feedbackMessages`

La allowlist de `scripts/arch-check.sh` (G2) ya no incluye estos nombres; recrearlos
en `src/lib/domain/` hará fallar el CI.

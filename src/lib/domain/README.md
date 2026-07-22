# `src/lib/domain/` — constantes y helpers de dominio

**Regla:** aquí solo vive lo genuinamente **cross-domain** (usado por 3+
features distintas).

Auditado en v6 (P3-8). Estado actual:

**Genuinamente cross-domain (mantener aquí):**
- `invoiceHelpers`, `invoiceTotals`, `lineItems`, `rentalCalculation` — matemática monetaria
- `roles`, `templateUtils`, `activityTranslations` — utilidades compartidas
- `errorCatalog`, `satCatalogs` — catálogos globales

**Candidatos futuros a mover al feature dueño (deuda técnica documentada):**
- `contractTypes` → `features/contracts/lib/`
- `customerTypes` → `features/customers/lib/`
- `creditNoteMotives` → `features/invoices/lib/`
- `paymentIntentStatus` → `features/invoices/lib/`
- `feedbackMessages` → `features/feedback/lib/`

Migración deferida: cada archivo tiene 5-20 consumidores; el movimiento debe
hacerse por sprint dedicado con actualización de imports + regla ESLint que
prohíba re-crearlos en `lib/domain/`.

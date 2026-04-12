

## Auditoría de Arquitectura del Codebase — Reporte

### Resumen Ejecutivo
El proyecto tiene una buena base arquitectónica: separación clara por dominios, hooks especializados, lazy loading en rutas, y componentes UI reutilizables. Sin embargo, hay deuda técnica acumulada, código muerto, duplicación de lógica, y algunos archivos que mezclan responsabilidades. A continuación las recomendaciones ordenadas de mayor a menor criticidad.

---

### 1. ALTA — Eliminar código muerto en PDF helpers (deuda técnica activa)

**Archivos:** `src/lib/pdfHelpers.ts`, `src/lib/quotePdfPremium.ts`

Tras la homologación v5.15.0, varias funciones ya NO se usan en ningún lado:
- `pdfHelpers.ts`: `drawPdfHeader`, `drawLineItemsTable`, `drawTotalsBlock`, `drawTotals`, `drawNotesBlock` — **0 importaciones de estas funciones**. Solo se importan `fetchCompanyDataAndLogo` y los tipos `PdfLineItem`/`CompanyData`.
- `quotePdfPremium.ts`: `drawInfoCards` (stub que retorna 0), `drawPremiumTotals`, `drawPremiumNotes`, `drawTermsSection` — marcadas "backward compat" pero ya nadie las usa.

**Acción:** Eliminar las funciones muertas. Mover `fetchCompanyDataAndLogo`, `CompanyData` y `PdfLineItem` de `pdfHelpers.ts` a `quotePdfPremium.ts` (el único consumidor real). Eliminar `pdfHelpers.ts` si queda vacío, o renombrarlo a algo más descriptivo como `pdfShared.ts`.

---

### 2. ALTA — Duplicación de utilidades entre componentes y libs

**Problema:** `fmtDate()` está definida **3 veces** con el mismo cuerpo:
- `src/lib/quotePdfPremium.ts` (línea 55)
- `src/components/invoices/InvoicePDFButton.tsx` (línea 15)
- Ambas idénticas: `format(parseISO(d), "dd/MM/yyyy")`

Las constantes de color (`GRAY_500`, `GRAY_200`, `GRAY_900`, `MARGIN`) están re-declaradas localmente en `InvoicePDFButton.tsx` cuando ya existen en `quotePdfPremium.ts`.

**Acción:** Exportar `fmtDate` desde `quotePdfPremium.ts` e importarla en `InvoicePDFButton`. Eliminar las constantes de color locales y usar las exportadas.

---

### 3. ALTA — IncomeStatementReport.tsx: componente monolítico de 710 líneas

**Archivo:** `src/components/reports/IncomeStatementReport.tsx`

Este componente hace fetch de datos (6 hooks), cálculos financieros, generación de PDF, y renderizado de tablas complejas — todo en un solo archivo.

**Acción:** Extraer:
- La lógica de cálculos financieros a un hook `useIncomeStatementData.ts`
- La generación del PDF a `src/lib/incomeStatementPdf.ts`
- Dejar el componente como puro render

---

### 4. MEDIA — useQuoteDetailLogic.ts contiene navegación y UI state

**Archivo:** `src/hooks/useQuoteDetailLogic.ts` (277 líneas)

Mezcla lógica de negocio pura (crear bookings, validar "Público en General") con estado de UI (diálogos, índice de delivery, navegación). Además importa `AppRole` sin usarlo.

**Acción:**
- Eliminar la importación no usada de `AppRole`
- Considerar separar el estado de diálogos/UI del hook de datos

---

### 5. MEDIA — Tipo `ContractData` duplicado entre archivos

**Problema:** `ContractData` se define en `src/lib/contractPdfGenerator.ts` y se re-exporta en `ContractPDFButton.tsx`. `ContractViewModel` en `src/types/rental.ts` tiene campos casi idénticos.

**Acción:** Unificar usando `ContractViewModel` del archivo de tipos centralizado, o generar `ContractData` derivándolo de los tipos auto-generados de la DB.

---

### 6. MEDIA — Legacy aliases sin uso en quotePdfPremium.ts

**Archivo:** `src/lib/quotePdfPremium.ts` líneas 20-26

```typescript
const NAVY = GRAY_900;
const NAVY_LIGHT = GRAY_700;
const GOLD = { r: 217, g: 165, b: 72 };
const GRAY_BG = GRAY_50;
const GRAY_BORDER = GRAY_200;
const GRAY_TEXT = GRAY_500;
const DARK_TEXT = GRAY_900;
```

Estos alias de "backward compat" ya no se usan (eran del viejo InvoicePDFButton). Son ruido.

**Acción:** Eliminar.

---

### 7. MEDIA — changelog.ts: 2,387 líneas en un solo archivo

**Archivo:** `src/lib/changelog.ts`

Crece con cada cambio. Eventualmente impactará el bundle size ya que se importa en el frontend.

**Acción:** A mediano plazo, mover el changelog a una tabla en la base de datos o a un archivo JSON que se cargue dinámicamente (lazy), en lugar de tenerlo hardcodeado en el bundle principal.

---

### 8. BAJA — `jsPDF` importado estáticamente en IncomeStatementReport

**Archivo:** `src/components/reports/IncomeStatementReport.tsx` línea 12

```typescript
import { jsPDF } from "jspdf";
```

Todos los demás PDF buttons usan `await import("jspdf")` (lazy). Este es el único que lo importa estáticamente, agregando ~200KB al chunk del módulo de reportes.

**Acción:** Cambiar a importación dinámica como en QuotePDFButton/InvoicePDFButton.

---

### 9. BAJA — Estructura de archivos consistente pero mejorable

**Observación positiva:** El proyecto sigue un patrón consistente:
- Componentes por dominio: `components/bookings/`, `components/invoices/`, etc.
- Hooks por entidad: `useBookings.ts`, `useInvoices.ts`, etc.
- Tipos centralizados en `src/types/rental.ts`

**Mejora opcional:** Los hooks de form logic (`useContractFormLogic`, `useInvoiceFormLogic`, `useQuoteFormLogic`, `useQuoteDetailLogic`) podrían vivir en sus respectivos subdirectorios de dominio (ej. `hooks/quotes/useQuoteDetailLogic.ts`) para reducir la lista plana de ~50 archivos en `hooks/`.

---

### 10. BAJA — useAuth re-export shim

**Archivo:** `src/hooks/useAuth.ts` — solo contiene:
```typescript
export { useAuth } from "@/contexts/AuthContext";
```

Esto mantiene compatibilidad con 13 archivos que importan de `@/hooks/useAuth`. No es un problema funcional pero es una indirección innecesaria.

**Acción (opcional):** Actualizar los 13 imports a `@/contexts/AuthContext` y eliminar el shim, o dejarlo como está (bajo riesgo).

---

### Resumen de acciones priorizadas

| Prioridad | Acción | Impacto |
|-----------|--------|---------|
| 1. Alta | Eliminar funciones muertas en pdfHelpers + quotePdfPremium | Reduce confusión, ~150 líneas menos |
| 2. Alta | Deduplicar fmtDate y constantes de color | Elimina 3 copias de la misma función |
| 3. Alta | Refactorizar IncomeStatementReport (710 loc) | Separación de concerns |
| 4. Media | Limpiar import no usado en useQuoteDetailLogic | Higiene de código |
| 5. Media | Unificar ContractData / ContractViewModel | Reduce tipos duplicados |
| 6. Media | Eliminar legacy color aliases | ~10 líneas de ruido |
| 7. Media | Lazy-load changelog | Reduce bundle size a futuro |
| 8. Baja | Lazy import de jsPDF en IncomeStatementReport | ~200KB menos en chunk |
| 9. Baja | Reorganizar hooks en subdirectorios | Navegación más limpia |
| 10. Baja | Eliminar useAuth shim | Reduce indirección |


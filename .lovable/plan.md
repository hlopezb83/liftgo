

## Auditoría de Arquitectura v2 — Reporte Post-Refactorización v5.16.0

La refactorización anterior (v5.16.0) resolvió los problemas más críticos: código muerto en pdfHelpers, duplicación de `fmtDate`, y el monolito de IncomeStatementReport. Este reporte identifica los problemas **remanentes**.

---

### 1. ALTA — `contractPdfGenerator.ts` importa `jsPDF` estáticamente (391 líneas)

`src/lib/contractPdfGenerator.ts` línea 1: `import { jsPDF } from "jspdf"`. Es el **único archivo restante** con importación estática de jsPDF (~200KB). Todos los demás (quotes, invoices, income statement) ya usan `await import("jspdf")`.

Además, este archivo mezcla: definición de tipos (`ContractData`, `PDFMode`), helpers genéricos (`addWrappedText`, `checkPage`), y 3 generadores de página. Los helpers podrían vivir en `pdfShared.ts`.

**Acción:** Convertir a importación dinámica en `ContractPDFButton.tsx` y pasar `doc` como parámetro a las funciones generadoras (ya lo hacen). Mover `addWrappedText`/`checkPage` a `pdfShared.ts`.

---

### 2. ALTA — `BookingActions.tsx`: JSX duplicado y componente de 269 líneas

El componente tiene **3 AlertDialog idénticos** para "Eliminar" (líneas 128-148 y 202-223 son copia exacta) y la lógica de `handleDelete`/`handleCancel`/`handleStatusChange` mezcla llamadas directas a Supabase con invalidación manual de queries — todo dentro del render.

**Acción:**
- Extraer `handleDelete` y `handleCancel` a un hook `useBookingActions(bookingId)`
- Crear un componente reutilizable `ConfirmDeleteDialog` usado en ambas ramas del render
- Reducir ~80 líneas de JSX duplicado

---

### 3. ALTA — `ContractData` duplica `ContractViewModel`

`src/lib/contractPdfGenerator.ts` define `ContractData` (líneas 15-38) con campos casi idénticos a `ContractViewModel` en `src/types/rental.ts` (líneas 34-70). Ambos tienen: `contract_number`, `customer_id`, `forklift_id`, `start_date`, `end_date`, rates, `deposit_amount`, `status`, `signed_at`, etc.

**Acción:** Usar `ContractViewModel` del archivo centralizado, o derivar `ContractData = Pick<ContractViewModel, ...>` + campos extra del PDF.

---

### 4. MEDIA — `changelog.ts` alcanza 2,404 líneas en el bundle principal

Crece ~20 líneas por versión. Actualmente se importa sincrónicamente. A este ritmo, en 6 meses serán ~3,000 líneas impactando el bundle inicial.

**Acción:** Mover el array a un archivo JSON (`public/changelog.json`) y cargarlo dinámicamente con `fetch()` en `ChangelogPage`. El tipo `ChangelogEntry` se queda en un archivo `.ts` ligero.

---

### 5. MEDIA — `useAuth.ts` shim con 7 consumidores

`src/hooks/useAuth.ts` es un re-export de una línea. 7 archivos (AuthPage, UserManagement, AppSidebar, AuthGuard, ChangePasswordDialog, PortalLogin, CustomerPortalLayout) importan desde ahí.

**Acción:** Actualizar los 7 imports a `@/contexts/AuthContext` y eliminar el archivo. Cambio mecánico, cero riesgo.

---

### 6. MEDIA — Llamadas directas a `supabase` en componentes UI

`BookingActions.tsx` hace `supabase.from("bookings").delete()` y `supabase.rpc("cancel_booking")` directamente en el componente. Esto rompe la separación de concerns que el resto del proyecto respeta (hooks para data, componentes para UI).

**Acción:** Mover estas operaciones a `useBookings.ts` como mutaciones (`useDeleteBooking`, `useCancelBooking`), siguiendo el patrón existente de `useUpdateBooking`.

---

### 7. BAJA — Hooks en lista plana (~50 archivos en `src/hooks/`)

Los hooks de form logic (`useContractFormLogic`, `useInvoiceFormLogic`, `useQuoteFormLogic`, `useQuoteDetailLogic`) podrían agruparse en subdirectorios por dominio.

**Acción (opcional):** Crear `hooks/quotes/`, `hooks/invoices/`, `hooks/contracts/` para los hooks de lógica de formularios.

---

### Resumen priorizado

| # | Prioridad | Acción | Impacto |
|---|-----------|--------|---------|
| 1 | Alta | Lazy-load jsPDF en contractPdfGenerator | ~200KB menos en chunk |
| 2 | Alta | Deduplicar JSX + extraer hook en BookingActions | ~80 líneas menos, separación de concerns |
| 3 | Alta | Unificar ContractData / ContractViewModel | Elimina tipo duplicado |
| 4 | Media | Lazy-load changelog.json | ~2,400 líneas fuera del bundle |
| 5 | Media | Eliminar useAuth shim | Reduce indirección (7 archivos) |
| 6 | Media | Mover operaciones Supabase de BookingActions a hooks | Consistencia arquitectónica |
| 7 | Baja | Reorganizar hooks en subdirectorios | Navegación más limpia |


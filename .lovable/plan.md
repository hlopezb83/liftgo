

# Auditoría Completa del Codebase — Resultados

## Estado General

El proyecto ha mejorado significativamente tras las optimizaciones recientes (AuthContext centralizado, staleTime global, hooks extraídos). Sin embargo, quedan problemas pendientes que se dividen en **deuda técnica activa** y **mejoras de consistencia**.

---

## Problemas Críticos

### 1. `_rentalMeta` — Data smuggling sin esquema (Pendiente de auditoría anterior)
En `useQuoteFormLogic.ts` línea 188:
```typescript
(finalLineItems[0] as any)._rentalMeta = rentalLines;
```
Los metadatos de renta se inyectan como propiedad oculta dentro del JSON de `line_items`. Esto es frágil, no tiene validación, y se lee con `as any` en la línea 81. Cualquier cambio en la estructura de line_items rompe silenciosamente la edición de cotizaciones.

**Fix**: Agregar columna `rental_meta JSONB` a la tabla `quotes`, o almacenar como campo top-level en el payload.

### 2. 272 ocurrencias de `as any` en 31 archivos
Los principales ofensores:
- **`useForklifts.ts`**: `acquisition_cost` y `category: "costo_venta"` no existen en los tipos generados
- **`UserManagementPage.tsx`**: `email`, `is_active` en profiles
- **`ForkliftSpecsCard.tsx`**, **`IncomeStatementReport.tsx`**: `acquisition_cost` 
- **`useQuoteFormLogic.ts`**: `quote_type`, `_rentalMeta`
- **`MaintenancePage.tsx`**, **`ExpenseFormDialog.tsx`**: payloads de mutación

Esto indica que el esquema de la DB tiene columnas que no están reflejadas en los tipos generados, o se usan valores que no coinciden con los enums/tipos definidos.

**Fix**: Asegurar que todas las columnas existan en el esquema (migration si faltan), luego regenerar tipos. Para campos que existen pero el tipo no se actualiza, crear interfaces de extensión en `src/types/`.

---

## Problemas de Alta Prioridad

### 3. `qc` vs `queryClient` — Inconsistencia de naming (11 archivos)
A pesar de que el plan anterior incluía renombrar `qc` → `queryClient`, estos archivos aún usan `qc`:
- `useCustomers.ts`, `useMaintenanceLogs.ts`, `useDocuments.ts`, `useMaintenancePolicies.ts`, `useCompanySettings.ts`, `useAssignForklifts.ts`, `useRolePermissions.ts`, `UserManagementPage.tsx`, `MaintenanceKanban.tsx`

**Fix**: Renombrar en batch.

### 4. `useCustomerPortal` deprecado pero aún exportado
El hook wrapper deprecado sigue existiendo. Ya no tiene consumidores (los portales usan hooks individuales), pero sigue en el código.

**Fix**: Eliminar la función `useCustomerPortal()` y su export.

### 5. `useFormState` usado inconsistentemente
Se usa en 7 archivos (`MaintenancePage`, `DeliveriesPage`, `InvoiceFormLogic`, `CustomerFormDialog`, `ReturnInspectionPage`, `ForkliftForm`, `CompanySettingsPage`). Pero `ContractForm` usa un patrón diferente (`useState` + `updateField`), y `QuoteForm` usa `useState` individual por campo.

Esto no es un bug, pero crea tres patrones de manejo de formularios coexistiendo:
1. `react-hook-form` + Zod (BookingForm)
2. `useFormState` (7 archivos)
3. `useState` manual (QuoteFormLogic, ContractFormLogic)

**Fix** (futuro): Estandarizar progresivamente. No es urgente pero añade carga cognitiva.

### 6. Toast mixing: `sonner` vs `use-toast`
- `useCustomers.ts` importa dinámicamente `@/hooks/use-toast` (shadcn toast)
- `useBookings.ts`, `useForklifts.ts`, `useQuotes.ts` usan `sonner`
- Dos sistemas de notificación coexisten

**Fix**: Estandarizar en `sonner` (que ya es el dominante) y eliminar imports de `use-toast` de los hooks de datos.

---

## Problemas de Prioridad Media

### 7. `contractPdfGenerator.ts` re-exporta desde `templateUtils.ts`
Línea 51: `export { replacePlaceholders } from "@/lib/templateUtils"` — Esta re-exportación es innecesaria y confusa. Los consumidores deberían importar directamente desde `templateUtils`.

### 8. `useContractFormLogic` exporta `parseISO` y `format`
El hook retorna utilidades de `date-fns` como parte de su API (`parseISO`, `format`). Estas son dependencias del componente UI, no lógica de negocio. El componente debería importarlas directamente.

### 9. ReportsPage sigue orquestando 6 hooks de datos
Como se identificó antes, `ReportsPage` y `IncomeStatementPage` aún fetchean todos los datos a nivel de página y los pasan como props a los componentes de reporte. Los reportes no poseen sus propios datos.

### 10. `QuotePDFButton` hace fetches directos a Supabase
El componente `QuotePDFButton` llama a `supabase.from("quotes")` directamente en el handler en lugar de usar los hooks existentes. Esto bypasea el cache de TanStack Query.

---

## Problemas de Baja Prioridad

### 11. Hooks sin `staleTime` individual restantes
`useStatusLogs`, `useAuditLogs`, `useContractTemplates`, `useNextQuoteNumber` — Estos son de uso limitado pero deberían seguir el patrón establecido.

### 12. `useUpdateContract` acepta `[key: string]: any`
La firma `{ id, ...updates }: { id: string; [key: string]: any }` elimina toda seguridad de tipos en las actualizaciones de contratos.

---

## Plan de Ejecución Recomendado

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 1 | Agregar columna `rental_meta` a quotes y eliminar hack `_rentalMeta` | Alto | Medio |
| 2 | Renombrar `qc` → `queryClient` en 11 archivos | Medio | Trivial |
| 3 | Eliminar `useCustomerPortal` deprecado | Bajo | Trivial |
| 4 | Estandarizar toasts en `sonner` (eliminar `use-toast` de hooks) | Medio | Bajo |
| 5 | Eliminar re-export de `replacePlaceholders` en `contractPdfGenerator.ts` | Bajo | Trivial |
| 6 | Dejar de exportar `parseISO`/`format` desde `useContractFormLogic` | Bajo | Trivial |
| 7 | Tipar `useUpdateContract` con `TablesUpdate<"contracts">` | Medio | Bajo |
| 8 | Agregar `staleTime` a hooks restantes | Bajo | Trivial |
| 9 | Auditar y reducir `as any` (requiere verificar columnas existentes en DB) | Alto | Alto |


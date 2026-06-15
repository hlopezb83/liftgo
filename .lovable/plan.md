# Plan: Implementar recomendaciones críticas del audit (#1–5)

Objetivo: eliminar las 5 deudas críticas de arquitectura sin cambiar comportamiento visible al usuario. Todo en frontend/hooks; sin migraciones de DB.

---

## #1 — Sacar Supabase de páginas y de `lib/`

**1.1 `features/auth/pages/AuthPage.tsx`**
- Crear `features/auth/hooks/useAuthRedirect.ts` que encapsule:
  - `supabase.auth.getSession()` inicial.
  - `supabase.auth.onAuthStateChange()` con cleanup `subscription.unsubscribe()`.
  - Retorno: `{ isAuthenticated: boolean | null }`.
- `AuthPage.tsx` queda como vista pura: consume el hook y redirige con `<Navigate>`.

**1.2 `features/invoices/lib/pdf/build.tsx`**
- Crear `features/invoices/hooks/useInvoicePdfData.ts` (TanStack Query) que haga los `supabase.from("invoices")` + `supabase.from("customers")`.
- `build.tsx` recibe los datos ya tipados como argumento y queda como render-only del PDF.
- Caller (botón "Descargar PDF") usa el hook → llama `build()` con el resultado.

---

## #2 — Eliminar `as unknown as` (5 sitios)

Para cada caso: refinar el tipo del query Supabase (proyección explícita + tipo derivado) en lugar de castear.

| Archivo | Acción |
|---|---|
| `features/crm/hooks/useProspects.ts:30` | Definir `type ProspectRow` desde `Database["public"]["Tables"]["prospects"]["Row"]` + joins explícitos. Eliminar `as unknown as`. |
| `features/cash-flow/hooks/useCashFlowProjection.ts:93` | Resuelto en #3 al extraer transformadores. |
| `features/returns/pages/ReturnInspectionDetail.tsx:38` | Tipar el hook `useReturnInspection(id)` con el shape de joins (`return_inspections + bookings + forklifts + customers`). |
| `features/returns/pages/ReturnInspectionPage.tsx` (×5) | Mover el tipo `ReturnInspectionWithJoins` al hook que retorna la lista; quitar casts de accessors. |

Regla: si Supabase no infiere bien por JSON columns, usar parsers en `lib/domain/` (ej. `parseLineItems(json)`).

---

## #3 — Descomponer `useCashFlowProjection`

Crear `features/cash-flow/lib/cashFlowTransformers.ts` con funciones puras y testeables:

```ts
export const toMxn = (amount: number, currency: string, fxRate: number) => …
export const buildPaidByInvoice = (payments: PaymentRow[]) => Map<string, number>
export const invoiceToItem = (inv: InvoiceRow, paidMap, fxRate) => CashFlowItem
export const billToItem = (bill: BillRow, fxRate) => CashFlowItem
export const bucketByWeek = (items: CashFlowItem[], settings) => CashFlowBucket[]
```

`useCashFlowProjection.ts` queda ≤80 LOC:
1. 3 queries paralelas tipadas (sin casts).
2. Llama a los transformadores puros.
3. Retorna `{ buckets, isLoading, error }`.

Añadir tests en `lib/cashFlowTransformers.test.ts` (MXN/USD, semanas vacías, edge cases).

---

## #4 — Limites silenciosos `.limit(500)`

**4.1 Constantes** (también cubre parte del #6 del audit):
- Crear `src/lib/supabase/constants.ts`:
  ```ts
  export const LIST_PAGE_LIMIT = 500;
  export const EXCLUDE_E2E_FILTER = "is_e2e.is.null,is_e2e.eq.false";
  ```

**4.2 Refactor en hooks**:
- `features/bookings/hooks/useBookings.ts` y `features/invoices/hooks/invoices/useInvoices.ts`: reemplazar `.limit(500)` por `.limit(LIST_PAGE_LIMIT)` y exponer un flag `hasReachedLimit: data.length >= LIST_PAGE_LIMIT`.

**4.3 Aviso UI**:
- En `BookingsPage` e `InvoicesPage`, mostrar `<Alert variant="warning">` cuando `hasReachedLimit` indique truncamiento, con copy en es-MX: "Mostrando los primeros 500 registros. Refina los filtros para ver más."

---

## #5 — Partir `components/ui/sidebar.tsx` (637 LOC)

Es un shadcn primitive. Dividir manteniendo la API pública intacta (mismos exports `Sidebar`, `SidebarTrigger`, etc.):

```
src/components/ui/sidebar/
  index.ts                  ← re-exports (mantiene "@/components/ui/sidebar")
  context.tsx               ← SidebarProvider, useSidebar, contexto + hooks de teclado
  Sidebar.tsx               ← componente raíz + variantes mobile/desktop
  SidebarRail.tsx           ← rail collapse
  SidebarNav.tsx            ← SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction
  SidebarSection.tsx        ← SidebarGroup, SidebarGroupLabel, SidebarGroupContent
  SidebarLayout.tsx         ← SidebarHeader, SidebarFooter, SidebarContent, SidebarInset
  variants.ts               ← cva tokens
```

Reglas:
- Cero cambios a imports en consumidores (`@/components/ui/sidebar` sigue resolviendo igual via `index.ts`).
- Cada archivo ≤150 LOC.
- Sin cambios visuales — solo move + split.

---

## Detalles técnicos clave

- TanStack Query: nuevos hooks siguen el patrón existente (`queryKey`, `staleTime`, `enabled`).
- Estricto: nada de `any`/`!`/`as`. Tipos derivados de `Database` types.
- Tests: añadir solo para `cashFlowTransformers` (los demás son refactors estructurales sin cambios de lógica; existing tests deben seguir verdes).
- `index.ts` barrel del sidebar evita romper ~30+ imports en el codebase.

## Verificación

1. `bunx tsc --noEmit` debe pasar (la harness lo corre automático).
2. `bunx vitest run` — tests existentes verdes + nuevos de transformers.
3. Smoke manual: login, dashboard, cash flow, sidebar collapse/mobile, bookings/invoices lists, descarga PDF de factura, detalle de return inspection, listado CRM prospects.

## Changelog

Entrada **v6.74.0** (minor — refactor arquitectónico significativo sin cambios funcionales):
- `public/changelog.json` (índice)
- `public/changelog/v6.74.0.json` (detalle: 5 items críticos del audit).

## Fuera de alcance (siguiente PR)

Recomendaciones #6–27 del audit (constantes compartidas extra, renames kebab-case, knip, etc.). Solo se incluye en este PR la mínima constante necesaria para #4.

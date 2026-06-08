# Plan: View-model explícito para Prospects de CRM

## Objetivo
Separar el modelo crudo de DB (snake_case) del modelo de vista que consume la UI (camelCase + campos derivados). Las cards de prospecto dejan de procesar filas crudas y leen sólo propiedades ya mapeadas y formateadas.

## Arquitectura propuesta

### 1. Tipos (`src/features/crm/lib/prospectTypes.ts` — nuevo)
- `ProspectRow` — shape exacto de la tabla `prospects` (snake_case, ints/strings tal cual vienen de Supabase).
- `Prospect` — view model camelCase + campos derivados:
  ```ts
  interface Prospect {
    id: string;
    companyName: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
    dealValue: number;
    dealValueLabel: string;        // formatCurrency(dealValue)
    stage: string;
    stageOrder: number;
    notes: string | null;
    quoteId: string | null;
    customerId: string | null;
    createdBy: string | null;
    createdByName: string | null;
    createdAt: string;             // ISO original
    createdAtLabel: string;        // "dd/MM/yyyy" es-MX
    updatedAt: string;
    staleDays: number;             // calculado vs nowMty()
    isStale: boolean;              // staleDays > 14 && !isClosed
    isClosed: boolean;
    closedAt: string | null;
    lostReason: string | null;
    finalAmount: number | null;
  }
  ```

### 2. Mapeador (`src/features/crm/lib/prospectMapper.ts` — nuevo)
- `mapProspectRow(row: ProspectRow, opts: { creatorName: string | null }): Prospect`
- Concentra: cálculo de `staleDays`, `isStale`, `isClosed`, formateo de moneda y fecha.
- `CLOSED_STAGES` constante exportada desde aquí (hoy vive duplicada en `ProspectCard.tsx` y en `useCRMFilters`).

### 3. Hook (`useProspects.ts`)
- Renombrar el tipo actual a `ProspectRow` localmente y exportar el nuevo `Prospect` desde `prospectTypes`.
- En `queryFn`: traer rows + perfiles → `rows.map(r => mapProspectRow(r, { creatorName: profileMap.get(r.created_by) ?? null }))`.
- `ProspectInsert` / `ProspectUpdate` pasan a basarse en `ProspectRow` (siguen siendo snake_case porque van a la DB).

### 4. Cards consumen sólo el view model
- `ProspectCard.tsx`: elimina `getStaleDays`, `CLOSED_STAGES`, cálculo de `isStale`. Usa `prospect.isStale` y `prospect.staleDays`.
- `ProspectCardParts.tsx`: reemplaza `prospect.company_name` → `companyName`, `deal_value` → `dealValueLabel` (sin `formatCurrency` inline), `contact_person` → `contactPerson`, `created_by_name` → `createdByName`, `created_at` → `createdAtLabel` (sin `format()` inline), `quote_id` → `quoteId`. Quita imports de `formatCurrency`, `date-fns` y `es`.

### 5. Migración del resto de consumidores (mecánica, snake → camel)
Estos archivos hoy leen el shape snake_case y deben adaptarse al view model:
- `KanbanColumn.tsx`, `CRMKanbanGrid.tsx`, `CRMPageDialogs.tsx`, `CRMHeaderKPIs.tsx`
- `ProspectDetailSheet.tsx`, `prospectDetail/ProspectInfoBlocks.tsx`, `prospectDetail/ProspectActions.tsx`, `ProspectHistoryCard.tsx`
- `CloseWonDialog.tsx`, `CloseLostDialog.tsx`
- `ProspectFormDialog.tsx`, `prospect-form/ProspectDialogParts.tsx`, `prospect-form/ProspectCloseDealActions.tsx`
- `useProspectForm.ts` (prefill desde Prospect → form en camelCase; al guardar, construir `ProspectInsert`/`Update` snake_case)
- `useCRMFilters.ts`, `useCRMMetrics.ts`, `useCRMPageDialogs.ts`
- `useProspectMutations.ts` (sus inputs siguen siendo snake_case = `ProspectInsert/Update`; sin cambios funcionales)
- `pages/CRMPage.tsx`, `pages/CRMClosedPage.tsx`, `pages/CustomersPage.tsx` (esta última sólo usa Prospect para conteos — verificar).

### 6. Tests
- Nuevo `src/features/crm/lib/__tests__/prospectMapper.test.ts`: cubre formateo MXN, fecha es-MX DD/MM/YYYY, `staleDays` con `nowMty()`, `isStale` vs `isClosed`, `createdByName` fallback `null`.

### 7. Changelog
`public/changelog/v6.24.5.json` (patch, category `refactor`) + entrada en `public/changelog.json`.

## ¿Tiene sentido?
Sí, es un refactor sano: elimina formateo disperso, centraliza reglas de "stale" y "closed", y deja la UI 100% declarativa sobre un modelo tipado. El costo es que toca ~18 archivos (mecánico, snake → camel), no sólo las cards.

## Decisión que necesito de ti
**Alcance de la migración:**

- **A) Migración completa** — Cambio `Prospect` a camelCase en todo el módulo CRM (lo descrito arriba). Una sola pasada, sin tipos paralelos. Cambios mecánicos en ~18 archivos. **Recomendado** — evita mantener dos shapes en paralelo.
- **B) Migración acotada a las cards** — Introduzco `ProspectViewModel` (nuevo) sólo para `useProspects`/cards; el resto sigue leyendo el tipo `Prospect` snake_case. Requiere mantener dos tipos y dos rutas de datos (cards vs. dialogs/forms). Menos archivos tocados ahora, pero deuda técnica futura.

¿Vamos con A o B?
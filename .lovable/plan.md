
# Tanda 2 — Optimizaciones estructurales de rendimiento (v7.231.0)

Tanda 1 ya fue aplicada (v7.230.0). Ahora ejecutamos los ítems estructurales del reporte `liftgo-analisis-rendimiento.md`.

## Alcance

### 1. P1-4 · Audit trigger sin XML + old/new solo en detalle
- **Migración:** modificar el trigger de auditoría (`20260215213953`) para excluir `cfdi_xml` (y columnas grandes equivalentes como `content` de contratos, `line_items` cuando aplique) de `old_data`/`new_data` usando `to_jsonb(OLD) - 'cfdi_xml' - 'content'`.
- **UI:** `ActivityPage` / lista de auditoría consulta columnas explícitas SIN `old_data`/`new_data`. El detalle (drill-down) hace fetch por id con esas columnas.

### 2. P1-5 · `/fleet` — vista `forklift_current_location`
- Crear vista SQL `forklift_current_location` (o RPC) que devuelve `forklift_id, current_location, has_active_policy` derivado de contracts/deliveries/policies activos.
- Refactor `FleetPage.tsx` para usar la vista en lugar de descargar `useContracts`/`useDeliveries`/`useMaintenancePolicies` completos.
- GRANT SELECT a `authenticated`.

### 3. P1-6 · Bail-outs del React Compiler
- **`DataTableBodyV2.tsx:57`** — eliminar refs-en-render, mover a `useRef` + `useEffect`.
- **`EquipmentListView.tsx:20`** — reescribir try/catch fuera del render (memoizar resultado).
- **`CalendarPage.tsx:30`** — mover `parseISO` fuera del comparador de sort (pre-computar timestamps).
- Objetivo: 0 warnings de `react-compiler/react-compiler` en estos 3 archivos.

### 4. P2-7 · Límites en queries sin paginar
- `useForklifts` — añadir `.limit(500)` + patrón "cargar más" si aplica.
- `useSupplierBills` — columnas explícitas + `.limit(500)`.
- `cash_flow_projection` — ventana temporal (últimos 12 meses) en pagos.

### 5. P2-9 · `CustomerSelector` → combobox cmdk
- Migrar de Radix Select a combobox cmdk con búsqueda (patrón de `GlobalSearch`).
- Mantener API pública del componente (props idénticas) para no romper llamadores.

### 6. P0-3.2 · Sentry Replay lazy
- En `main.tsx` (o donde se inicializa Sentry), reemplazar el import estático de `replayIntegration` por `Sentry.lazyLoadIntegration("replayIntegration")` invocado sólo en `beforeSend` cuando hay error.

### 7. P3-10.1 · Consolidar `company_settings`
- Un solo query `useCompanySettings()` que devuelve la fila completa; hooks derivados (`useCxpApprovalThreshold`, `useCashFlowSettings`) usan `select` sobre esa query.
- `public_branding` queda aparte (pública pre-login).

### 8. P3-10.2 · Invalidaciones quirúrgicas de bookings/quotes
- Cambiar invalidaciones "root" por `setQueryData` (patrón `useUpdateForklift`) o `invalidateQueries({ queryKey: detail(id) })` + `lists()` en `useCreateBooking`/`useCancelBooking`/`useDeleteBooking` y equivalentes de quotes.

## Fuera de alcance
- Recomendaciones ya aplicadas en Tanda 1.
- P3-11 (favicon/fonts) más allá de lo hecho.
- Cambios que impliquen rediseño UX.

## Verificación
- `tsgo` limpio.
- Vitest suite completa passing.
- Re-medir React Compiler: 0 bail-outs en los 3 archivos objetivo.
- Manual smoke test: /fleet (menos requests), /audit (payloads menores), /invoices form (CustomerSelector responsive), calendario sin jank.
- Changelog: entrada `v7.231.0` (minor — cambios estructurales pero backward-compatible).

## Notas técnicas
- El trigger de auditoría requiere `SET search_path = public` y respetar el patrón `SECURITY DEFINER`.
- La vista `forklift_current_location` debe declararse `security_invoker=true` para respetar RLS del caller.
- El combobox `cmdk` debe soportar `disabled`, `placeholder` y estado controlado como el Select actual.

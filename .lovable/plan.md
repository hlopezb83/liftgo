# Auditoría UI/UX — Reporte y plan de estandarización

Consolidado a partir de dos subagentes (código: filtros y tablas/UI kit). El tercer subagente (captura visual 1600×900) no logró conectar al dev server; los hallazgos se sostienen sobre lectura de código y son suficientes para actuar. Si quieres, en la primera acción del sprint agrego una pasada Playwright con timeouts largos.

---

## Diagnóstico

**Lo que está bien**

- `DataTableV2` + `useLiftgoTable`: sticky header, zebra `even:bg-muted/30`, sorting con `aria-sort`, `EmptyRow`, densidad `h-9`/`px-3 py-2`/`text-xs` header/`text-sm` body. 25 tablas ya lo usan.
- Sprint A (tokens semánticos): 0 hits de `text-white` / `bg-black` / `bg-[#…]`. Sin regresiones.
- Diálogos: 100% usan Radix `Dialog`/`Sheet`/`AlertDialog`.

**Lo que rompe la sensación de "una sola app"**

1. **Filtros — el mayor problema.** Conviven 3 generaciones:
  - Canónico `useTableFilters` + `FiltersToolbar` → sólo 4 páginas (Proveedores, Auditoría, Changelog, Cuentas por Pagar).
  - Legacy `useListFilters` → ~7 páginas (Cotizaciones, Contratos, Clientes, Daños, Mantenimiento…).
  - Ad-hoc por feature (`useResourceList`, `useInventoryFilters`, `useUserManagementFilters`, `useCRMFilters`) → ~10 páginas.
2. **Mismo filtro, 4 UIs**: status en `Tabs` (Contratos, Facturas), `Select` (Cotizaciones, Daños), agrupador visual (Bank Reconciliation, CRM Cerrados) o secciones fijas.
3. **Botón "Limpiar filtros" ausente** en 8+ páginas. En Facturas el botón X sólo limpia el date range (bug de UX).
4. **Persistencia rota**: `forkliftFilter` de Mantenimiento vive en `useState`; Reportes lee `?type=` al montar pero no lo escribe al cambiar; CRM Cerrados pierde won/lost al recargar.
5. **Placeholders y microcopy divergentes** ("Buscar…" vs "Buscar…", elipsis unicode vs `...`, largo variable).
6. **Tablas HTML puras** (P0): `BankAccountsPage`, `PortalInvoicesTable`, `RolePermissionsPage` — cada una reinventa zebra (`i%2===1` vs `even:`), sticky y densidad.
7. **Tablas shadcn crudas** (P1): `CashFlowTable` (zebra invertida `odd:`, sin sorting/paginación), `AgingReportPage`, `BankStatementImportsHistoryPage`, `IncomeStatementTable`.
8. **Badges fuera de `StatusBadge**`: `RepBadge` y `InvoiceCreditNotesCard` hardcodean "Timbrado(a)" con `bg-success hover:bg-success/90` (los badges de estado no son interactivos en el resto de la app). `ReconciliationBadge` usa `text-3xs`, fuera de la escala del `Badge` base.
9. **Cards custom**: 14+ `<div className="border rounded-lg">` reemplazando `Card`, incluido un `border rounded-lg` envolviendo un `DataTableV2` en `MaintenancePoliciesTab`.
10. **Alturas mixtas de botón** en `PageHeader.actions` (`sm` = h-9 vs default = h-10 en `AgingReportPage`).

---

## Estándares canónicos a fijar

**Filtros — regla de decisión:**


| Tipo                                           | Componente                                                  | Cuándo                           |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| Status ≤4-5 opciones                           | `FiltersToolbar.StatusTabs`                                 | uno-a-la-vez, uso frecuente      |
| Status ≥5-6                                    | `FiltersToolbar.StatusSelect`                               | —                                |
| Multi-select                                   | `FiltersToolbar.MultiSelect` (**nuevo**, facet `multiEnum`) | tipo, cliente, tags              |
| Rango fecha                                    | `FiltersToolbar.DateRange` (facet `dateRange` ya existe)    | siempre que haya filtro temporal |
| Texto libre                                    | `FiltersToolbar.Search` con `useDeferredValue`              | siempre                          |
| Cambio de vista/dataset (won/lost, list/board) | `<Tabs>` **fuera** del toolbar                              | no es filtro de la misma tabla   |


**Reglas duras:**

- Todo filtro pasa por `useTableFilters` con `storage: "url"` por defecto.
- Todo `FiltersToolbar` incluye `ClearAll` con label uniforme "Limpiar filtros".
- Placeholder: `Buscar {entidad en plural}…` (elipsis unicode).
- Prohibido reimplementar el hook a mano (borrar `useListFilters`, `useCRMFilters`, `useResourceList`, `useInventoryFilters`, `useUserManagementFilters` al terminar la migración).

**Tablas:** `DataTableV2` + `useLiftgoTable` obligatorio para listados. Zebra vía CSS (`even:bg-muted/30`), nunca `idx % 2`. Empty state vía `EmptyRow`. Drill-down por side panel, no columna de acciones.

**UI Kit:** botón primario de `PageHeader.actions` = `size="sm"` (h-9). Estados con `StatusBadge` (agregar `stamped` al catálogo). Contenedores con `Card`/`CardContent`, no `border rounded-*` sueltos.

---

## Plan de ejecución (3 sprints)

### Sprint F — Estandarización de filtros (P0, mayor impacto UX)

**F1. Extender el contrato canónico**

- Añadir facet `multiEnum` a `useTableFilters` (arrays en URL vía CSV o repeats).
- Añadir componentes al toolbar: `FiltersToolbar.MultiSelect`, `FiltersToolbar.DateRange` (envoltorio de `DateRangePickerField`).
- Documentar reglas y `PLACEHOLDER_TEMPLATES` en un archivo `src/components/filters/README.md`.

**F2. P0 (bugs activos)**

- Facturas (`InvoicesToolbar`): migrar Tabs + DateRange + Search a `FiltersToolbar`; el `ClearAll` limpia todo, no sólo la fecha.
- Mantenimiento: mover `forkliftFilter` a `useTableFilters` (URL).
- Bank Reconciliation: convertir las secciones fijas en filtro `status` real con `StatusTabs`.

**F3. P1 (alto tráfico, sin "limpiar")**

- Cotizaciones, Contratos, Daños, Usuarios: reemplazar `useListFilters`/hooks propios por `useTableFilters`. Unificar placeholders.
- CRM Pipeline: sustituir `useCRMFilters` por `useTableFilters` con facets `multiEnum` para creador y rangos.
- Reportes: sincronizar `?type=` en cambios (`setReportType` → `filters.update`).
- CRM Cerrados: persistir won/lost en URL (o convertir a facet `status` si son la misma tabla filtrada).

**F4. P2**

- Flota (requiere migrar también su tabla legada — se hace en Sprint G).
- Inventario, Clientes.
- Borrar `useListFilters`, `useCRMFilters`, `useResourceList`, `useInventoryFilters`, `useUserManagementFilters` cuando queden sin consumidores. Marca de éxito: `rg "useListFilters\|useCRMFilters" src/` = 0 hits.

### Sprint G — Migración de tablas legadas

**G1. P0 — HTML puro → `DataTableV2**`

- `BankAccountsPage`: quitar la `<table>` manual y su zebra `i%2===1`. Convertir columna de acciones a drill-down side panel (patrón del resto).
- `PortalInvoicesTable`: migrar a `DataTableV2`. La fila expandida (`PaymentDetailTable`) pasa a side panel del portal (o `getRowCanExpand` si se quiere mantener inline, con expand nativo de TanStack).
- `RolePermissionsPage`: envolver la matriz en `Table` shadcn con `TableHead` estándar (uppercase `text-xs`), o documentarla explícitamente como "matriz de permisos" (patrón aparte). Preferencia: envoltura estándar.

**G2. P1 — shadcn "cruda" → `DataTableV2**`

- `CashFlowTable`: zebra `even:`, `useLiftgoTable`, `TableFooter` para la fila total (elimina `font-bold` manual).
- `AgingReportPage`, `BankStatementImportsHistoryPage`: ya usan `TableSkeleton`, migración directa.
- `IncomeStatementTable` / `ComparisonTable`: extraer patrón "columna sticky-left" a `DataTableV2` (nuevo `meta.stickyLeft`), reutilizable en futuros reportes multi-año.

### Sprint H — Polish del UI Kit

- **Badges**: agregar `stamped` a `StatusBadge`; borrar `RepBadge` inline y el `<Badge>` custom de `InvoiceCreditNotesCard`. Eliminar `text-3xs` de `ReconciliationBadge`.
- **Cards**: reemplazar `border rounded-*` custom por `Card`/`CardContent` en `CashFlowSettingsBar`, `MaintenancePoliciesTab`, `RecurringPreviewBody`, `RecurringInvoicesResultDialog`, `CreditNoteLinesTable`.
- **Botones**: fijar `size="sm"` como default en `PageHeader.actions`; arreglar los ~10-15 headers con size implícito (`AgingReportPage` y hermanos).
- **Truncate**: añadir `truncate` + `min-w-0` a celdas de texto largo en las tablas HTML tras la migración de G1.
- **Gaps**: documentar escala (`gap-3` toolbars, `gap-4` secciones, `gap-6` páginas) y corregir las 7 mezclas detectadas.

---

## Detalles técnicos

- Facet `multiEnum` en `useTableFilters`: serializar como `?tipos=a,b,c`, parseo defensivo, `hasActive` = `values.length > 0`.
- `FiltersToolbar.MultiSelect`: `DropdownMenu` con `CheckboxItem`, contador en el trigger (`Tipos (2)`), reutiliza tipografía/altura de `Select`.
- Migración de tablas: mantener la firma de columnas actual, pero mover `render` a `ColumnDef<T>` con `header`/`cell` y `meta.cellClassName` para `truncate`.
- Rollout por commit lógico (una página por commit) para minimizar riesgo de regresión y facilitar bisect.
- Cada sprint cierra con: nueva entrada en changelog (Sprint F = 7.68.0, G = 7.69.0, H = 7.70.0), verificación Playwright de al menos 5 rutas, y `rg` de anti-patrones a cero.

**Pregunta antes de empezar**: ¿arranco por Sprint F completo (F1 + F2 + F3 en una sola tanda) o prefieres que corte por lotes (F1+F2 primero, revisas, luego F3)? Todo el sprint F y Auditoria visual al terminar 
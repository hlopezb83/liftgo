# Auditoría UI/UX — Desktop 1600x900

Metodología: capturé 8 rutas a 1600x900 (Panel, Facturas, Reservas, Clientes, Equipos, Cotizaciones, Mantenimiento, Configuración) y disparé 3 subagentes en paralelo (espaciado/layout, tipografía/color, UI Kit). Consolidado abajo, ordenado por severidad y agrupado por eje. Cada fila indica **archivo:línea**, problema y clase/componente sugerido.

---

## 1) Bugs visuales confirmados en screenshots (1600x900)

| # | Ruta | Problema visto | Fix propuesto |
|---|---|---|---|
| V1 | `/settings/operations` | Los tabs (Modelos, Operadores, Mecánicos, Pólizas, Plantilla, Datos Fiscales, Logo, Aprobaciones) **wrappean a 2 filas** en 1600px — se ve como parche. | Reducir `px` interno del `TabsTrigger` a `px-3`, o convertir en `Tabs` verticales con sidebar interno cuando haya >5 tabs. |
| V2 | `/settings/operations` | Filas de tabla con altura muy superior al resto de la app (`py-4` vs `py-2` estándar), bordes `rounded-lg` en celdas, columna "Fabricante" repite "LIFT GO" en todas las filas. | Migrar a `DataTableV2` + `useLiftgoTable`. Colapsar Fabricante como agrupación o eliminar la columna si es único. |
| V3 | Panel (Dashboard) | Dos filas de tarjetas KPI con **estilos de icono distintos**: fila 1 = cuadrados grises con icono negro; fila 2 = círculos tintados con icono de color. Rompe el ritmo visual. | Unificar en `KpiTile`: cuadrado `rounded-lg bg-muted` + icono `text-muted-foreground`. |
| V4 | `/invoices`, `/fleet` | Los `StatusBadge` mezclan **formas**: "Cancelado" rectángulo rojo relleno vs "Pagado" pill verde vs "Sin Pagar" pill azul vs "Disponible" pill verde vs "Rentado" pill azul. | Estandarizar a pill `rounded-full` con `variant` semántica en `StatusBadge`. Ver hallazgos T1–T4 y U4. |
| V5 | `/fleet` | Última fila de "Vendido" queda cortada por el fold, y la columna "Ubicación" vacía (—) desperdicia ~120px a 1600. | Colapsar columnas vacías o usar `min-w` en lugar de fijo. Ver L5. |
| V6 | `/invoices` | Acciones sólo `eye icon` a la derecha; el resto de la app usa drill-down por click en fila. Redundante. | Eliminar columna de acciones (ya existe navegación por row-click). |

---

## 2) Layout y Espaciado (15 hallazgos)

| # | Sev | Archivo:Línea | Problema | Fix |
|---|---|---|---|---|
| L1 | CRIT | `src/components/layout/ListPageLayout.tsx:107` | `space-y-*` distinto a `PageContainer`. | `space-y-6` para igualar. |
| L2 | HIGH | `src/components/layout/DetailLayout.tsx:44` | Sin `max-w`; en 1600px+ las secciones se estiran. | Envolver en `PageContainer maxWidth="wide"`. |
| L3 | HIGH | `src/components/feedback/TableSkeleton.tsx:20` | `p-4` vs `TableCell` real `px-3 py-2`; skeleton más alto. | `px-3 py-2`. |
| L4 | MED | `src/components/domain/KpiTile.tsx:98` | Mezcla `p-3` y `p-4` en dashboard. | Estandarizar a `p-4`. |
| L5 | MED | `src/features/audit/pages/AuditTrailPage.tsx:86` | `max-w-[160px]` fuerza truncado. | `max-w-[250px]` o `min-w`. |
| L6 | MED | `src/components/layout/FormPageHeader.tsx:21` | `gap-2` vs `PageHeader:19` `gap-3`. | `gap-3`. |
| L7 | MED | `src/components/forms/FormSection.tsx:20` | `space-y-3` denso. | `space-y-4`. |
| L8 | MED | `src/components/layout/ListToolbar.tsx:37` | `space-y-2` vs `ListPageLayout:198` `space-y-3`. | `space-y-3`. |
| L9 | MED | `src/features/feedback/pages/FeedbackManagementPage.tsx:38` | Grid salta 1→3→6. | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6`. |
| L10 | LOW | `src/components/layout/ListPageLayout.tsx:165` | Pull-to-refresh usa `-mt-2 -mb-2`. | Posicionamiento absoluto. |
| L11 | LOW | `src/components/layout/DetailLayout.tsx:64` | `mb-2` insuficiente en títulos de sección. | `mb-4`. |
| L12 | LOW | `src/components/layout/PageHeader.tsx:22` | `-ml-2` en botón Volver. | Revisar contenedor. |
| L13 | LOW | `src/components/layout/PageContainer.tsx:21` | `max-w-3xl` estrecho para forms de 2 columnas. | `max-w-4xl`. |
| L14 | LOW | `src/components/domain/KpiTile.tsx:100` | Icono `rounded-xl` vs botones `rounded-lg`. | `rounded-lg`. |
| L15 | LOW | `src/components/ui/ErrorDetailsDialog.tsx:44` | Doble scroll potencial. | Coordinar `max-h`. |

---

## 3) Tipografía y Color (15 hallazgos)

Patrón dominante: `text-white` **hardcoded** sobre badges con fondo semántico → rompe theming.

| # | Sev | Archivo:Línea | Fix |
|---|---|---|---|
| T1 | HIGH | `src/components/feedback/StatusBadge.tsx:11` | `text-white` → `text-success-foreground`. |
| T2 | HIGH | `src/components/feedback/StatusBadge.tsx:12` | `text-white` → `text-info-foreground`. |
| T3 | HIGH | `src/components/feedback/StatusBadge.tsx:15` | `text-white` → `text-primary-foreground`. |
| T4 | HIGH | `src/features/bank-reconciliation/components/ReconciliationBadge.tsx:20` | `text-white` → `text-success-foreground`. |
| T5 | HIGH | `src/features/invoices/components/invoice-detail/InvoiceDetailBadges.tsx:7-8` | `text-white` → `text-info-foreground` / `text-success-foreground`. |
| T6 | HIGH | `src/features/accounts-payable/components/SupplierRepStatusBadge.tsx:10` | idem. |
| T7 | HIGH | `src/features/accounts-payable/components/BillApprovalSection.tsx:30` | idem. |
| T8 | MED | `src/features/calendar/components/calendar/GanttRow.tsx:59` | `text-white` → `text-primary-foreground`. |
| T9 | MED | `src/features/audit/components/activity/ActorAvatar.tsx:38` | idem. |
| T10 | MED | `src/layouts/sidebar/SidebarBranding.tsx:14` | `bg-white` → `bg-card` (evita flash en dark mode). |
| T11 | MED | `src/layouts/ErrorBoundary.tsx:96` | `text-lg font-semibold` → `text-xl sm:text-2xl` (alinea con PageHeader). |
| T12 | MED | `src/components/feedback/EmptyState.tsx:24` | `text-lg font-semibold` → `text-xl`. |
| T13 | LOW | `src/components/layout/DetailLayout.tsx:64` | Extraer `text-xs font-semibold uppercase tracking-wide` a `@apply section-label` (utility). |
| T14 | LOW | `src/features/feedback/pages/FeedbackManagementPage.tsx:42` | idem. |
| T15 | LOW | Global | Unificar `text-muted-foreground` (nunca `text-gray-500` / `text-slate-500`). |

---

## 4) Consistencia de UI Kit (15 hallazgos)

| # | Sev | Archivo:Línea | Problema | Fix |
|---|---|---|---|---|
| U1 | CRIT | `src/features/bank-reconciliation/components/BankStatementLinesTable.tsx:32` | `<table>` HTML nativo. | Migrar a `DataTableV2` + `useLiftgoTable`. |
| U2 | CRIT | `src/features/accounts-payable/components/PaymentsExportTable.tsx:43` | Tabla nativa. | `DataTableV2`. |
| U3 | CRIT | `src/features/invoices/components/invoice-detail/PaymentIntentsSection.tsx:72` | Tabla nativa con `bg-muted/20` ad-hoc. | `DataTableV2`. |
| U4 | HIGH | `src/features/accounts-payable/components/BillApprovalSection.tsx:34` | `StatusBadgeApproval` local. | Reutilizar `StatusBadge`. |
| U5 | HIGH | `src/features/accounts-payable/components/SupplierRepStatusBadge.tsx:16` | Badge duplicado. | `StatusBadge`. |
| U6 | HIGH | `src/features/accounts-payable/components/SupplierPaymentRepReceived.tsx:31` | `<button>` con `hover:underline`. | `<Button variant="link" size="sm" className="h-auto p-0">`. |
| U7 | HIGH | `src/features/audit/components/activity/ActivityByMember.tsx:30` | `<button>` nativo. | `<Button variant="ghost">`. |
| U8 | HIGH | `src/features/damage/components/damage/DamageEvidenceSection.tsx:51` | `<button>` con `bg-red-500`. | `<Button variant="destructive" size="icon" className="h-6 w-6">`. |
| U9 | HIGH | `src/features/customers/pages/CustomersPage.tsx:140` | Filtros con `<button>` custom. | Usar `Badge outline` o `Button ghost`. |
| U10 | MED | `src/components/feedback/KeyboardShortcutsDialog.tsx:37` | `<Dialog>` fuera del patrón `FormDialog`. | Envolver o crear `BaseModal`. |
| U11 | MED | `src/components/domain/KpiTile.tsx:100` | `rounded-xl` vs `rounded-lg` del sistema. | `rounded-lg`. |
| U12 | MED | `src/features/auth/pages/AuthPage.tsx:67` | Logo `rounded-2xl`. | `rounded-lg`. |
| U13 | MED | `src/components/forms/DatePickerField.tsx:67` | Fecha en `<Dialog>` full screen. | Migrar a `Popover`. |
| U14 | LOW | `src/components/forms/DatePickerField.tsx` vs `DateField.tsx` | Duplicidad. | Consolidar en `fields/`. |
| U15 | LOW | `src/features/portal/components/statement/PortalInvoicesTable.tsx:70` | `<button>` sin feedback. | `<Button variant="ghost" size="sm">`. |

---

## Plan de remediación sugerido (5 sprints)

1. **Sprint A — Badges & Tokens (T1–T9, U4, U5).** Un solo PR: elimina todos los `text-white` hardcoded y colapsa `StatusBadgeApproval` / `SupplierRepStatusBadge` en el `StatusBadge` global. Cambio quirúrgico, alto impacto visual.
2. **Sprint B — Tablas huérfanas (U1, U2, U3, V2).** Migrar `BankStatementLinesTable`, `PaymentsExportTable`, `PaymentIntentsSection` y la tabla de Modelos de Equipo a `DataTableV2`.
3. **Sprint C — Layout tokens (L1–L8, V1).** Unificar `space-y-*`, `gap-*`, `p-*` en los layouts base y arreglar wrap de tabs en Configuración.
4. **Sprint D — Botones & Modales (U6–U10, U13).** Eliminar `<button>` nativos y migrar DatePicker a Popover.
5. **Sprint E — Pulido (L9–L15, T10–T15, U11–U15, V3–V6).** Grids responsive, escalas tipográficas, radios, columnas vacías.

Cada sprint agregaría entrada al changelog (SemVer minor para A–C, patch para D–E).

## Alcance de esta interacción

Este mensaje es **sólo el reporte**. No se modifica código hasta que confirmes qué sprint(s) quieres ejecutar (o si prefieres ir uno por uno). ¿Empezamos por **Sprint A (Badges & Tokens)** — el de mayor ratio impacto/riesgo?

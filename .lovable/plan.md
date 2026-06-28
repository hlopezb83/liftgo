# Auditoría de Navegación por Teclado

## Resultado

**Lo que ya está bien ✅**

- Sistema de hotkeys completo (`useHotkeys.ts`): `Ctrl+K`, `?`, `g+d/c/...`, `Mod+Shift+N`, con guardas para inputs y diálogo de ayuda.
- Todos los Dialogs/Sheets usan Radix/shadcn → focus trap, Escape, `aria-modal` gratis.
- Sin `tabIndex > 0`, sin `outline-none` huérfanos.

**Lo que falla ❌** — Resumen por severidad:


| #   | Severidad  | Archivo                                           | Problema                                                     |
| --- | ---------- | ------------------------------------------------- | ------------------------------------------------------------ |
| C-1 | 🔴 Crítico | `dataTable/v2/DataTableBodyV2.tsx`                | Filas clickeables de TODAS las tablas sin acceso por teclado |
| C-2 | 🔴 Crítico | `bank-reconciliation/BankStatementLinesTable.tsx` | `<tr onClick>` raw sin teclado                               |
| C-3 | 🔴 Crítico | `incomeStatement/StatementTableRow.tsx`           | Filas expandibles sin teclado                                |
| C-4 | 🔴 Crítico | `cash-flow/CashFlowTable.tsx`                     | Filas drill-down sin teclado                                 |
| W-1 | 🟠 Warning | `layouts/MainLayout.tsx`                          | Sin skip-to-content link                                     |
| W-2 | 🟠 Warning | 7 archivos                                        | Botones icon-only sin `aria-label`                           |
| W-3 | 🟠 Warning | `layout/DetailPageHeader.tsx`                     | Botón "Volver" sin `aria-label`                              |
| W-4 | 🟠 Warning | `dataTable/v2/DataTableHeaderV2.tsx`              | Headers sortables no activables por teclado                  |
| W-5 | 🟠 Warning | `dashboard/AlertsRow.tsx`                         | Cards de alertas no alcanzables por teclado                  |
| W-6 | 🟠 Warning | `FleetRowAndCard.tsx`, `MaintenanceRow.tsx`       | Cards móviles sin teclado                                    |


## Plan de implementación

### Fase 1 — Críticos (máxima cobertura, 1 archivo arregla casi toda la app)

1. `**DataTableBodyV2.tsx**` — agregar `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space) y `focus-visible:ring-2` cuando hay `onRowClick`. *Esto arregla automáticamente Flotilla, Reservas, Facturas, Clientes, etc.*
2. `**BankStatementLinesTable.tsx**` — mismo patrón en `<tr onClick>`.
3. `**StatementTableRow.tsx**` — agregar `aria-expanded` además del patrón anterior.
4. `**CashFlowTable.tsx**` — mismo patrón.

### Fase 2 — Warnings de alta visibilidad

5. `**MainLayout.tsx**` — skip link "Saltar al contenido" + `id="main-content"` en `<main>`.
6. `**DetailPageHeader.tsx**` — `aria-label="Volver"` (afecta todas las páginas de detalle).
7. `**DataTableHeaderV2.tsx**` — envolver header sortable en `<button>` real.

### Fase 3 — Warnings de microcomponentes

8. `**aria-label` en botones icon-only** (7 archivos): UserMobileCard, StpTransferCard, usePaymentHistoryColumns, ImageGalleryLightbox, EditableList, ClausesEditor, ChecklistEditor.
9. **Cards navegables**: AlertsRow, FleetRowAndCard, MaintenanceRow — patrón tabIndex/role/onKeyDown.

### Fase 4 — Cierre

10. Actualizar `changelog.json` + `public/changelog/vX.Y.Z.json` (minor → v6.100.0, "Auditoría completa de navegación por teclado y accesibilidad").

## Patrón estándar a aplicar

```tsx
// Para fila/card clickeable:
<TableRow
  className={cn("cursor-pointer", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1")}
  onClick={() => onRowClick(item)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(item);
    }
  }}
  tabIndex={0}
  role="button"
>
```

## Alcance

- Solo cambios de presentación/A11y, cero lógica de negocio.
- ~12 archivos modificados, 1 changelog.
- Sin migraciones de DB ni Edge Functions.

¿Procedo con las 4 fases completas, o prefieres que ejecute solo Fase 1 (críticos) primero? todas las fases. 
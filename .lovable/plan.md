## Auditoría R23 — validación previa

Verifiqué en fuente antes de planear. Los hallazgos críticos y altos son **reales**:

- **R23-1 confirmado**: `rg "=> \{format" src/` devuelve exactamente las 10 celdas reportadas (RevenueReport 80/81, AgingReport 65, MaintenanceCostReport 43, MaintenancePoliciesTab 85, PortalInvoiceDetail 26/27/36, SupplierDetailPage 56/63). Son arrow functions con cuerpo de bloque sin `return` → renderizan vacío.
- **R23-2 confirmado**: `MainLayout.tsx:74` usa `h-[100dvh]` y `:82` `main#main-content` con `overflow-auto`; el bloque `@media print` de `index.css:324` no resetea altura ni overflow.
- **R23-A confirmado**: `FormDialog` ya tiene `requestClose` interno con confirmación, pero **no lo expone**; `FormActions.onCancel` llama `onOpenChange(false)` directo → el botón Cancelar salta el guard.
- **R23-B confirmado**: `ProspectFormDialog.tsx` hace `onSave(payload); onOpenChange(false)` sin `await`.
- **R23-D confirmado**: `AccountsPayableKpiCards.tsx` usa `text-lg font-mono` fijo sin `kpiSizeClass` (que ya existe en el proyecto).
- **R23-E confirmado**: `bankParseUtils.parseAmount` borra todas las comas; `"1.500,50"` → `1.5005`. Corrupción silenciosa.

---

## Fase 1 — Críticos (bloquean release)

1. **Celdas money vacías**: cambiar las 10 `cell: ({ row }) => {fmt(...)}` a expresión directa `=> fmt(...)`.
2. **Print**: en `@media print` de `index.css`, resetear altura/overflow del shell:
   `#main-content, main, .h-\[100dvh\] { height:auto !important; max-height:none !important; overflow:visible !important; }`
3. Guard anti-regresión: test unitario que hace grep del patrón `=> {format` en `src/` y falla si hay ocurrencias (Vitest, rápido y sin depender de CI externo).

## Fase 2 — Altos

4. **R23-A dirty-guard en Cancelar**: exponer `requestClose` desde `FormDialog` vía contexto (`FormDialogContext`); `FormActions` consume el contexto y lo usa como fallback cuando existe, manteniendo `onCancel` como API actual para consumidores fuera de diálogo. Sin tocar los 17 consumidores uno por uno.
5. **R23-B ProspectFormDialog**: hacer `handleSubmit` async, `await onSave(payload)` y cerrar sólo en éxito (tipar `onSave` como `Promise<void> | void`).
6. **R23-C Kanban mid-flight**: en `useProspectMutations`, invalidar en `onSettled` sólo cuando no queden mutaciones en vuelo (`queryClient.isMutating({ mutationKey })` === 1).
7. **R23-D CxP KPIs**: aplicar `kpiSizeClass` + `formatCurrency` compacto y quitar el `text-lg` fijo.
8. **R23-E parser es-MX**: detección de formato en `parseAmount` — si hay coma y punto, el último separador manda; si sólo hay coma con 2 decimales, tratarla como decimal. Tests unitarios para `"1.500,50"`, `"1,500.50"`, `"1500,50"`, `"(1,234.56)"`.

## Fase 3 — Medios (misma sesión, tras validar Fase 1-2)

- **R23-G/H/I** Kanban: reindexar `stage_order` en servidor dentro de la RPC de movimiento, usar `useMoveProspectStage` también en reorden de misma columna, y drop en área vacía → `items.length`.
- **R23-J** CSV: validar número de columnas por fila y reportar error en vez de correr columnas.
- **R23-K** reset de `value` en el file input del uploader.
- **R23-L** `confirm_bank_matches`: cambiar de all-or-nothing a por-línea con reporte de fallidas.
- **R23-M** quitar `|| ""` en columnas para que `createLiftgoSortingFn` maneje nulos.
- **R23-N/O** `.no-print` en toolbars/paginadores/FAB; `noValidate` + validación Zod en el formulario de prospecto.
- **R23-F** reset completo en `useRecordPaymentForm` y campos faltantes en el cálculo de dirty.

## Fase 4 — Bajos

Title Case residual, `version.json` desalineado, atajo "C" del panel de conciliación, keys duplicadas en preview, % conciliado excluyendo ignorados, y limpieza de la rama muerta `cerrado_ganado`.

## Notas técnicas

- Cada fase cierra con `tsgo`, `bun run lint` y las suites Vitest afectadas.
- Se agrega entrada de changelog (`public/changelog.json` + `public/changelog/v7.254.0.json` + `CHANGELOG.md`) al final; Fase 1-2 justifican un **minor** (7.254.0) por el fix de parser y el cambio de contrato de `FormDialog`.
- No se toca lógica monetaria de negocio: la auditoría certifica 114/114 en suites monetarias y la única corrección de datos es el parser de importación bancaria.

# fix-04.diff — M-11a, M-11b, H-9, M-12, L-6a

Validé los cinco parches contra el código y la base de datos (PostgreSQL 17.6). Los cinco atacan problemas reales, pero **dos necesitan corrección respecto al diff**.

## Qué está mal hoy (verificado)

- **M-11a / M-11b (sobrescritura de cambios ajenos)**: `useUpdateCustomer` y `useUpdateForklift` hacen `update(...).eq("id", id)` sin ninguna condición de concurrencia. Si dos usuarios abren el mismo cliente/unidad, el último en guardar pisa los cambios del primero sin aviso. Además, `useUpdateForklift` **no filtra `deleted_at IS NULL`** (la columna existe): se puede "revivir" una unidad archivada por otro usuario.
- **H-9 (costos visibles para todos)**: `ForkliftRatesCard` y `ForkliftSpecsCard` muestran tarifas, costo de adquisición y costo de póliza a cualquier rol. Las policies de `forklifts` dan `SELECT` de la fila completa a mecánico, despachador, ventas y auditor, así que hoy un mecánico ve el costo de compra del equipo.
- **M-12 (importación bancaria grande)**: `useImportBankStatement` hace un solo `upsert` con todas las líneas del archivo. Con archivos grandes revienta por tamaño de payload / timeout, y si falla queda el header `bank_statement_imports` huérfano.
- **L-6a (búsqueda global)**: si 1 o 2 de las 3 consultas fallan, la sección afectada se muestra como "sin resultados" en vez de avisar del error.

## Correcciones al diff propuesto

1. **M-11a/b — el diff no protege de verdad.** Lee `updated_at` justo antes del `UPDATE`, así que la ventana de detección es de milisegundos: el cambio del otro usuario ya ocurrió entre que se abrió el formulario y el guardado, y esa lectura fresca simplemente lo confirma como "válido". El bloqueo optimista real exige comparar contra el valor que el formulario **cargó**. Se implementa así:
   - `customers` ya tiene columna `version` con trigger `bump_version_optimistic`; se usa `eq("version", expectedVersion)`, donde `expectedVersion` viene del registro cargado en el formulario.
   - `forklifts` no tiene `version`; se usa `eq("updated_at", expectedUpdatedAt)` del registro cargado (trigger `update_forklifts_updated_at` lo mantiene).
   - Si el llamador no envía el valor esperado, se cae al comportamiento actual (sin bloqueo) para no romper flujos internos; se añade primero en los formularios de edición de cliente y de unidad.
2. **M-12 — el cleanup del diff es correcto pero incompleto**: el `DELETE` de líneas por `import_id` no borra las filas que el upsert descartó como duplicadas de un import previo (correcto), pero sí debe ejecutarse antes de borrar el header. Se conserva y se añade manejo del caso "el cleanup también falla" (avisar en vez de tragarse el error). Se quita el `console.info` de progreso y se reporta el avance por toast/estado del diálogo.

## Plan

### Frontend
- `useCustomers.ts`: aceptar `expectedVersion` opcional, filtrar por él, mensaje claro de conflicto ("otro usuario modificó el registro; recarga y vuelve a intentar"), mantener `deleted_at IS NULL`.
- `useForkliftMutations.ts`: aceptar `expectedUpdatedAt` opcional, añadir `.is("deleted_at", null)`, mismo mensaje de conflicto.
- Formularios/acciones que llaman a esos hooks (`useCustomerDetailActions.ts`, `CustomersPage.tsx`, `useForkliftFormSubmit.ts`): pasar el valor cargado.
- **H-9**: nuevo hook `useCanSeeFinancialCosts()` en `features/fleet` (o `features/users`) que resuelve `admin`/`administrativo` o acceso `full` a "Facturas"; `ForkliftRatesCard` no se renderiza y `ForkliftSpecsCard` oculta costo de adquisición y costo de póliza cuando no aplica. Fail-closed mientras cargan los permisos.
- **M-12**: upsert en lotes de 1000 con cleanup del header ante fallo y progreso visible en la UI.
- **L-6a**: `EntityResults.errors` por sección + aviso por sección en `GlobalSearch.tsx`.
- `pgErrorCatalog.ts`: mensaje amable para el conflicto de concurrencia.

### Nota de alcance
H-9 es un ocultamiento en la interfaz; la base sigue devolviendo la fila completa a esos roles. Bloquearlo de verdad requiere una vista sin columnas de costo o policies por columna — lo dejo fuera de esta tanda y lo propongo como seguimiento si lo quieres.

### Verificación
- Vitest nuevos: conflicto de versión en cliente/unidad, gating de costos por rol, chunking del importador (mock con 2 500 líneas), errores parciales de búsqueda.
- `bun run lint`, build y suite completa.
- Changelog: entrada **minor** (v7.338.0) más su archivo de detalle.

## Detalle técnico
- No se requieren migraciones SQL: `customers.version`, `customers.deleted_at`, `forklifts.deleted_at` y los triggers de `updated_at` ya existen.
- El `UPDATE ... WHERE version = X` devuelve 0 filas en conflicto; se distingue del caso "sin permisos (RLS)" con una lectura previa de existencia sólo cuando hay 0 filas, para no dar un mensaje engañoso.

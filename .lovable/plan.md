## Lote 8 — Migración final a `useEntityMutation` + `createEntityKeys`

Cerrar la migración DRY completando las features que aún usan `useMutation` + `useQueryClient` + `notifyError` manual. Es el barrido de mayor volumen y el que dejará al sistema con un único patrón de mutación.

### Alcance

**A. Hooks CRUD a migrar (13 archivos, ~40 mutations)**

| Feature | Archivo | # mutations | Notas |
|---|---|---|---|
| bookings | `useBookingMutations.ts` | 5 | create/update/delete/status/extend |
| fleet | `useForkliftMutations.ts` | 5 | create/update/delete/status/insurance |
| fleet | `useDrivers.ts` | 4 | crud simple |
| fleet | `useEquipmentModels.ts` | 4 | crud simple |
| inventory | `usePartInventoryMutations.ts` | 5 | create/update/delete/adjustStock |
| customers | `useCustomers.ts` | 4 | create/update/delete (mantener query) |
| crm | `useProspectMutations.ts` | 4 | crud + convert |
| maintenance | `useMechanics.ts` | 4 | crud |
| maintenance | `useMaintenancePolicies.ts` | 4 | crud |
| maintenance | `useMaintenanceLogs.ts` | 4 | crud |
| suppliers | `useSuppliers.ts` | 3 | crud |
| suppliers | `useSupplierContacts.ts` | 4 | crud |
| suppliers | `useSupplierBankAccounts.ts` | 4 | crud |

**B. Adoptar `createEntityKeys` donde aún no existe**
- Crear factories: `driverKeys`, `equipmentModelKeys`, `prospectKeys`, `mechanicKeys`, `maintenancePolicyKeys`, `maintenanceLogKeys`, `supplierKeys`, `supplierContactKeys`, `supplierBankAccountKeys`, `partInventoryKeys`.
- Ya existen o serán consumidas: `bookingKeys`, `forkliftKeys`, `customerKeys`, `invoiceKeys`. Verificar que sean jerárquicas.

**C. Reglas de migración**
- Mantener firma pública de cada hook idéntica (mismos parámetros y tipos de retorno).
- `useDeleteX` con `removeQueries` pre-invalidación se mantiene manual y se documenta (patrón ya usado en `useDeleteInvoice`).
- Mutations con toast condicional o efectos multi-tabla usan `onSuccess` custom.
- Cada mutation obtiene `errorTitle` explícito (garantiza toast de error donde antes era silencioso).

### Fuera de alcance
- Hooks CFDI (usePaymentComplement, useStampCfdi, useCancelCfdi, useRefreshCancellationStatus): tienen ramificación SAT que se abordará por separado.
- `useBankLineActions`: flujo transaccional multi-paso, requiere análisis dedicado.
- `useUserMutations`: interacciones con Edge Functions de admin (invite/reset/delete) con validaciones especiales.
- Modificar componentes UI, schemas o RPCs.

### Verificación
- `tsgo` limpio.
- `bunx vitest run` completo (esperado: ≥800 tests verdes).
- `bunx knip --include files,dependencies,binaries` sin nuevos huérfanos.
- Smoke manual: crear/editar/borrar un booking, un forklift, un customer y un supplier desde la UI.

### Entregables
- Hasta 13 archivos de hooks refactorizados.
- Hasta 10 factories nuevas de query keys.
- Entrada `v6.139.0` (minor) en `public/changelog.json` + `public/changelog/v6.139.0.json`.
- Actualización de `mem://shared-schemas-and-utils` para reflejar cobertura total.

### Orden de ejecución
1. Fleet (forklifts, drivers, equipment_models) + verificación.
2. Bookings + verificación (feature core, mayor riesgo).
3. Inventory (parts) + verificación.
4. Customers + CRM (prospects) + verificación.
5. Maintenance (logs, policies, mechanics) + verificación.
6. Suppliers (base, contacts, bank accounts) + verificación.
7. Typecheck global + tests globales + Knip.
8. Changelog + memoria actualizada.

### Estimación de impacto
- ~250–300 LOC de boilerplate eliminadas.
- Toasts de error garantizados en ~15 mutations que hoy son silenciosas.
- Cero cambios visuales ni de comportamiento observable por el usuario final.

# Tanda 3 (v7.232.0) — cerrar los pendientes de rendimiento

Ya aplicados (v7.230.0 + v7.231.0): P0-1, P0-2, P0-3.1, P0-3.2, P0-3.3, P1-4, P1-6 parcial (EquipmentListView), P2-7 parcial (forklifts + supplier_bills), P2-8, P3-10.4, P3-11.

Faltan de la Tanda 2 original + Tanda 3:

## 1. P1-5 · Vista `forklift_current_location` para /fleet

**Estado actual:** `FleetPage.tsx` monta `useContracts` (trae `content` completo de contratos), `useDeliveries` y `useMaintenancePolicies`, sin `.limit()`, solo para derivar `activePolicyForkliftIds` y `locationMap`.

**Cambio:** migración que cree la vista `public.forklift_current_location` (una fila por montacargas con `forklift_id`, `usage_location`, `has_active_policy`, `active_customer_name`). La lógica ya vive en `useForkliftLocation.ts:13-38`; se traslada a SQL con `security_invoker=true`. Nuevo hook `useForkliftLocations()` que consulta la vista. `FleetPage` deja de llamar los 3 hooks pesados.

## 2. P1-6 restante · Bail-outs del React Compiler

- **`src/components/dataTable/v2/DataTableBodyV2.tsx:57-135`**: extraer los `useRef`+timers a un hook `useRowLongPress()` para eliminar el bail-out por refs en render (afecta las 25 filas × N celdas de TODAS las tablas).
- **`src/features/calendar/pages/CalendarPage.tsx:30`**: reemplazar el try/catch en render por precomputación memoizada (mismo patrón ya aplicado a EquipmentListView).

## 3. P2-7 restante · Ventana temporal en cash-flow

**`src/features/cash-flow/lib/queryKeys.ts:62-64`**: `payments` se descarga sin rango. Acotar a últimos 12 meses + próximos 12 meses (`issue_date >= now() - interval '12 months'` y `<= now() + interval '12 months'`), que es la ventana que la proyección muestra.

## 4. P2-9 · `CustomerSelector` → combobox `cmdk`

`src/features/customers/components/customers/CustomerSelector.tsx` usa Radix `<Select>` con hasta 500 `<SelectItem>` (jank visible al abrir). Migrar al patrón combobox de `GlobalSearch` (Popover + `cmdk` con `CommandInput` para búsqueda incremental). Mantener API pública (`value`, `onChange`, `placeholder`) para no tocar los 6+ formularios que lo consumen.

## 5. P3-10.1 · Consolidar `company_settings`

Hoy 4 queries distintas (`company_settings`, `cxp_approval_threshold`, `cash_flow_settings`, `public_branding`) traen la misma fila singleton. Crear `useCompanySettings()` como fuente única; los 3 hooks derivados (excepto `public_branding`, que es pre-login) hacen `select` sobre la data cacheada vía `useQuery` con la misma key raíz.

## 6. P3-10.2 · Invalidaciones quirúrgicas de bookings/quotes

Reemplazar `queryClient.invalidateQueries({ queryKey: bookingKeys.all })` en `useCreateBooking`, `useCancelBooking`, `useDeleteBooking` por `setQueryData` en `detail(id)` + `invalidateQueries({ queryKey: bookingKeys.lists() })`. Mismo patrón para quotes. Modelo: `useUpdateForklift`.

## Verificación

- `/fleet`: 3 requests en mount (antes 6).
- Calendario: sin bail-out del compiler en CalendarPage/DataTableBodyV2.
- CustomerSelector: apertura instantánea con 500 clientes.
- `bunx tsgo --noEmit` limpio, `bunx vitest run` verde (191 archivos / 1251 tests hoy).
- Nueva entrada en `public/changelog.json` + `public/changelog/v7.232.0.json`, `public/version.json` a `7.232.0`.

## Detalles técnicos

- La vista `forklift_current_location` va con `WITH (security_invoker = true)` y `GRANT SELECT ... TO authenticated` (patrón ya usado en el proyecto).
- El combobox `cmdk` requiere `Popover`+`Command` de shadcn (ya instalados). Se hará un componente compartido `EntityCombobox` reutilizable para clientes / proveedores / equipos en una siguiente tanda si funciona bien.
- Las invalidaciones quirúrgicas se validan con los tests existentes de `bookings.mutations.test.ts` (si no existen, se añaden).

## Fuera de alcance

- P3-10.3 (invalidar dashboard tras pagos) — trade-off documentado en el reporte, requiere decisión de producto.
- Auto-hosting de fuentes, lazy de RHF/zod — impacto marginal, no lo pide el reporte como prioritario.

# Auditoría: otras tablas/mutaciones con el mismo riesgo

## Hallazgos a nivel RLS (tablas)

Revisé todas las políticas `UPDATE`/`DELETE` del esquema `public`. Después del fix de `profiles`, **solo queda una tabla con el mismo patrón estricto**:

| Tabla | Política UPDATE/DELETE | ¿Riesgo de éxito silencioso? |
|---|---|---|
| `notifications` | solo `auth.uid() = user_id` | ⚠️ Sí, si algún flujo admin intenta marcar/eliminar notificaciones ajenas. |
| Resto (`activity_feed`, `billing_secrets`, `contract_templates`, `forklifts`, `maintenance_parts`, `parts_inventory`, `suppliers`, `user_roles`, etc.) | Cubiertas por `FOR ALL` de admin/administrativo más roles explícitos. | ✅ No. |

**Acción RLS sugerida**: ninguna por ahora — `notifications` solo se manipula desde el propio usuario en el código actual (`rg "from(\"notifications\")"` no encuentra writes admin). Si algún día se agrega un panel admin, replicar el patrón de `profiles`.

## Hallazgo principal: anti-patrón en el frontend

El bug raíz **no es solo de `profiles`**: es que **cualquier mutación que llame `.update().eq()` sin `.select()` ni verificación de filas** dispara `onSuccess` aunque RLS filtre la fila y modifique 0 registros.

Hay **27 archivos** con `.update()` (sin contar tests). Aunque hoy las policies cubren los flujos actuales, el sistema es frágil: cualquier cambio de policy o cualquier mutación cruzada (ej. un dispatcher tocando un campo restringido) volverá a producir el "toast verde mentiroso" que el usuario acaba de reportar.

## Plan en 2 fases

### Fase 1 — Helper compartido (esta entrega)

Crear `src/lib/supabase/assertRowsAffected.ts`:

```ts
export function assertRowsAffected<T>(
  data: T[] | null,
  context: string,
): asserts data is T[] {
  if (!data || data.length === 0) {
    throw new Error(
      `${context}: no se modificó ningún registro. Verifica tus permisos o que el registro exista.`,
    );
  }
}
```

Y un patrón canónico:

```ts
const { data, error } = await supabase
  .from("tabla")
  .update({...})
  .eq("id", id)
  .select("id");
if (error) throw error;
assertRowsAffected(data, "Actualizar tabla");
```

Reutilizar en `useUpdateName`/`useUpdateRole` que ya quedaron arreglados (refactor para usar el helper, sin cambiar comportamiento).

### Fase 2 — Migración progresiva (prioridad alta → baja)

Aplicar el patrón a los 27 archivos en este orden por impacto operativo:

**Alta prioridad** (mutaciones que un admin/staff hace sobre datos de otros):
1. `useProspectMutations.ts` — CRM (Ventas vs Closed Won)
2. `useBookingMutations.ts` / `useBookingExtensions.ts` — reservas
3. `useInvoices.ts` / `usePayments.ts` — cobranza
4. `useQuotes.ts` / `useQuoteBookingCreator.ts` — cotizaciones
5. `useContracts.ts` / `useContractTemplates.ts` — contratos
6. `useDamageRecords.ts` — daños
7. `useDeliveries.ts` — entregas
8. `useMaintenanceLogs.ts` / `useMaintenancePolicies.ts` / `useMechanics.ts`
9. `useForkliftMutations.ts` / `useAssignForklifts.ts` / `useEquipmentModels.ts` / `useDrivers.ts`
10. `useSuppliers.ts` / `useCustomers.ts`
11. `useUpdateExpense.ts`
12. `usePartInventoryMutations.ts`
13. `useRolePermissions.ts` / `useBillingSecrets.ts` / `useCompanySettings.ts`

Cada archivo se convierte por separado (1 commit lógico por archivo, sin tocar lógica de negocio).

## Recomendación de alcance

Te propongo **hacer Fase 1 completa + Fase 2 alta prioridad (puntos 1–5)** en esta misma entrega. El resto puede ir en un PR de seguimiento si prefieres separar el riesgo de revisión.

**Cambio de DB**: ninguno (no es necesario tocar más policies hoy).

**Changelog**: patch `6.15.2` describiendo el helper y la lista de hooks migrados.

## Verificación

- `npx tsc --noEmit` + `eslint` limpios.
- Smoke manual: editar un registro como rol que no tiene permiso → debe aparecer error con "Ver detalles" en vez de éxito.

## Fuera de alcance

- Cambios de RLS en `notifications` (sin caso de uso actual).
- Inserts/Deletes (el mismo patrón aplica pero con menor frecuencia de bug; se puede atacar en otra ronda).
- Renombrar `notifyError` o tocar `appFeedback.ts`.

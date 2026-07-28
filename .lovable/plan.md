# Plan de Remediación R18 → v7.239.0

Auditoría R18 confirmó 2 CRÍTICOS + 3 ALTOS + ~11 medios. Verifiqué los principales en el código:

- `useClosedProspects.ts:49` navega a `/customers/new` (ruta inexistente).
- `ContractForm.tsx` mezcla `FormField` (controlados) con `register()` crudo en 6 campos.
- `contractPayload.ts:28` pisa `booking_id` a null en edición.
- `DamageTrackingPage.tsx:165` pasa `record={detail.selected}` (stale).
- `DamageActions.tsx:36` navega a `/invoices/new?damage_id=…` pero el prefill nunca lo consume.

---

## Fase 1 — Críticos (bloqueantes)

### C-1 · CTA "Convertir a cliente"

- `src/features/crm/hooks/useClosedProspects.ts`: cambiar URL a `/customers?from_prospect=true&prospect_id=…`.
- Gatear el CTA por rol (`RoleGuard minAccess="full"` o `useUserRole` en `closedColumns.tsx`).

### C-2 · ContractForm: 6 campos `register()` → `FormField` controlados

Campos afectados en `src/features/contracts/pages/ContractForm.tsx`:
`usage_location`, `contract_city`, `terms_text`, `signed_by`, `witness_1`, `witness_2`, `notes`.

- Convertir cada uno a `<FormField control={control} name="…" render={…}>` con `Input`/`Textarea` que reciban `{...field}`.
- Esto garantiza que `form.reset(mapContractToForm(existing))` re-hidrate correctamente en edición.

---

## Fase 2 — Altos

### A-1 · Preservar `booking_id` en edición

- `src/features/contracts/lib/contractPayload.ts:28`: aceptar `existing` y usar `booking_id: bookingId || existing?.booking_id || null`. Ajustar callers.

### A-2 · DamageDetailSheet stale

- `src/features/damage/pages/DamageTrackingPage.tsx`: derivar `selectedRecord = detail.selected ? (records?.find(r => r.id === detail.selected!.id) ?? detail.selected) : null` y pasar `record={selectedRecord}`.

### A-3 · Cobrar daño → prellenar factura

- `src/features/damage/components/damage/DamageActions.tsx`: ya envía `damage_id`, `customer_id`, `amount`. Consumir estos query params en `useInvoicePrefill` cuando `!isEdit`: setear `customer_id` y crear una partida con `description="Cobro por daño …"` y `amount`.
- En `submit` de creación de factura: si viene `damage_id`, hacer PATCH `damage_records.status='invoiced'`.

---

## Fase 3 — Medios / Bajos (misma tanda)


| #     | Fix                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| M-2   | `useBillApprovalMutations.ts`: invalidar `exportablePayableQueries` tras aprobar                            |
| M-3   | `useRegisterSupplierPayment.ts`: invalidar `cashFlowProjectionQueries`                                      |
| M-4   | Filtro de exportables: incluir `status IN ('approved','not_required')`                                      |
| M-6   | Booking transition mutations: normalizar `PostgrestError` (extraer `.message`) y evitar doble toast         |
| M-9   | Cubierto por C-2 (form controlado ya no pierde teclado antes de hidratar)                                   |
| M-10b | `STATUS_LABELS` de contratos: usar `CONTRACT_STATUS_LABELS` en `StatusBadge` cuando `entity="contract"`     |
| M-11  | `useQuotePrefill.ts`: normalizar `rental_meta` legacy → `discount: meta.discount ?? 0`                      |
| M-12  | Detalle factura: ocultar "Cancelar CFDI" cuando `cfdi_status='cancelled'` y mostrar badge                   |
| M-13  | `/users`: gatear "Crear Usuario", selects y toggles con `RoleGuard minAccess="full"` (auditor solo lectura) |
| C-3   | `useReturnInspectionDialog.ts:76`: condición correcta `["major_damage","needs_repair"].includes(condition)` |
| C-5   | RPC `complete_return_inspection`: agregar guard `p_hours_used >= 0` (migración SQL)                         |


---

## Fase 4 — Cierre

- Bump a **v7.239.0** (minor: correcciones de datos/seguridad + 2 críticos).
- `public/changelog.json` + `public/changelog/v7.239.0.json` con detalle por hallazgo.
- Validación: `bun run typecheck`, `bun run lint`, unit tests afectados (contract form, invoice prefill, damage sheet).

## Detalle técnico

- Toda la Fase 1-3 es frontend + 2 helpers de query invalidation + 1 migración SQL (C-5).
- Sin cambios de schema salvo el guard `>= 0` en la RPC.
- Sin dependencias nuevas.

¿Ejecuto todo (Fase 1+2+3) en un solo release v7.239.0, o prefieres solo críticos primero?

Ejecuta todo, verifica sean bugs reales.

&nbsp;
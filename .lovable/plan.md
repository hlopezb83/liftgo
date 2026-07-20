# Ola 3.10 — Más forms schema-first + `useUnsavedChangesGuard`

Auditoría de v7.131.0 y v7.131.1: **1126/1126 verde**, knip exit 0, sin bugs abiertos. Auditoría integral cerrada 34/34.

Esta ola extiende el patrón schema-first (RHF + Zod + `useUnsavedChangesGuard` + cobertura de schema/payload) a **3 dialogs** de alto uso que aún carecen del guard, dejándolos alineados con `SupplierBillFormDialog` (Ola 3.7) y `ContractForm` (Ola 3.2).

## Alcance (3 forms)

### 1. `SupplierFormDialog`
Ya usa RHF + Zod. Faltan **guard + tests**.

- Agregar `useUnsavedChangesGuard(open && form.formState.isDirty && !isPending)`.
- Extraer `buildPayload` y `supplierToFormData` a `src/features/suppliers/lib/supplierFormPayload.ts` para testearlos aisladamente.
- Tests nuevos:
  - `supplierFormSchema.test.ts` — validaciones (nombre requerido, email opcional, RFC opcional MX, `default_payment_terms_days` rango 0-365).
  - `supplierFormPayload.test.ts` — `buildPayload` (trim, `nullable`, RFC uppercase, terms `null` cuando vacío).

### 2. `CustomerFormDialog`
Ya usa RHF + Zod. Faltan **guard + tests + fix menor**.

- Agregar `useUnsavedChangesGuard(open && form.formState.isDirty && !(isPending ?? false))`.
- Corregir dep-array del `usePrefillEffect`: incluir `initialData` (hoy sólo depende de `open`, causa datos rancios si el mismo dialog reabre con otro cliente).
- Tests nuevos:
  - `customerFormSchema.test.ts` — validar name requerido, email/RFC opcionales, CP fiscal 5 dígitos.
  - Test integración de `handleCsfParsed`: patch merge sin sobreescribir valores existentes.

### 3. `PartFormDialog`
Ya usa RHF + Zod. Faltan **guard + tests + migrar `useEffect` a `usePrefillEffect`**.

- Reemplazar `useEffect` manual por `usePrefillEffect` (consistencia con el resto de dialogs).
- Agregar `useUnsavedChangesGuard(open && form.formState.isDirty && !isPending)`.
- Tests nuevos:
  - `partFormSchema.test.ts` — validaciones (name requerido, category enum, stock/min ≥ 0, unit_cost ≥ 0).
  - Payload test: `sku` vacío → `null`, todos los números pasan tal cual.

## Fuera de alcance

- No se tocan `CustomerFormSections` ni `SupplierFormFields` (sub-componentes ya funcionales).
- No se migran diálogos de acción puntual (`ApproveBillDialog`, `CloseWonDialog`, `PostBookingDeliveryDialog`, etc.): son one-shot con 1-2 campos donde el guard aportaría fricción sin valor. Se dejan documentados para triage futuro.
- No se toca `useInvoiceFormLogic` ni `useQuoteForm`: ya blindados en olas 3.2 y 3.5.

## Verificación

- `bunx vitest run` — objetivo **1126 → ~1146** (+~20 tests).
- `bunx knip --include files,dependencies,binaries --reporter compact` → exit 0.
- Sin nuevos warnings ESLint.
- Smoke visual con Playwright: abrir cada dialog, marcar como dirty, intentar cerrar → confirmar prompt.

## Entregable

- Changelog **v7.132.0** (`minor`) con detalle por dialog, tests agregados y confirmación de suites verdes.
- Actualizar `mem://design/form-dialogs` si el patrón queda formalmente consolidado en estos 3.

## Detalles técnicos

```text
src/features/suppliers/
├── components/suppliers/SupplierFormDialog.tsx        (M: guard, payload extraído)
├── lib/supplierFormPayload.ts                          (N)
└── lib/__tests__/
    ├── supplierFormSchema.test.ts                      (N)
    └── supplierFormPayload.test.ts                     (N)

src/features/customers/
├── components/customers/CustomerFormDialog.tsx         (M: guard, deps fix)
└── lib/__tests__/
    ├── customerFormSchema.test.ts                      (N)
    └── customerFormDialog-csf.test.tsx                 (N, integración)

src/features/inventory/
├── components/inventory/PartFormDialog.tsx             (M: guard, usePrefillEffect)
└── lib/__tests__/
    ├── partFormSchema.test.ts                          (N)
    └── partFormPayload.test.ts                         (N)
```

Todos los guards usan la firma canónica `useUnsavedChangesGuard(open && form.formState.isDirty && !isPending)` alineada con Ola 3.7.

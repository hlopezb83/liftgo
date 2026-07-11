# Migración a Zod 4

## Alcance
- `zod` `^3.25.76` → `^4.x` en el proyecto frontend y en las Edge Functions.
- 36 archivos usan `zod` directamente. La superficie de API "riesgosa" es acotada:
  - **9** usos de `invalid_type_error` / `required_error` (API de mensajes deprecada en v4).
  - **3** usos de `.transform(...).pipe(...)` (patrón que cambia en v4).
  - `.brand()` no se usa. `z.record()` no se usa. `errorMap` global no se usa.
  - `ZodError.issues` (lo que ya leemos en `errorDetailsExtract.ts`) sigue siendo la forma oficial en v4 ✅.
- `@hookform/resolvers` `^3.10` es compatible con Zod 4 vía `zodResolver` sin cambios.

## Cambios clave que introduce Zod 4
1. `invalid_type_error` / `required_error` se reemplazan por la nueva API `{ error: (issue) => "..." }` o por `.refine`/mensajes en cada validador.
2. `.transform(...).pipe(schema)` sigue existiendo, pero la forma canónica pasa a ser `z.pipe(input, output)` o encadenar directo; hay que verificar que la inferencia de tipos siga correcta.
3. `z.string().email()` y otros validadores string ahora son subtipos (`z.email()`), pero `.email()` sigue funcionando como shortcut compatible.
4. `ZodError.errors` → renombrado a `.issues` (ya usamos `.issues`).
5. `.default()` ahora es sólo para input, la salida es siempre requerida (impacta tipos `z.infer`, no comportamiento runtime).

## Plan de ejecución

### Paso 1 — Instalar y compilar
- Actualizar `zod` a `^4.0.0` en `package.json` y correr `bun install`.
- Ejecutar `tsgo` y capturar la lista completa de errores de tipos.

### Paso 2 — Refactor de APIs deprecadas (antes de tocar tests)
Archivos a editar:
- `src/lib/schemas/common.ts` — reemplazar `z.number({ invalid_type_error })` por firma v4.
- `src/features/deliveries/lib/deliveryFormSchema.ts`
- `src/features/portal/components/ReportTransferDialog.tsx`
- `src/features/bank-reconciliation/components/BankAccountFormDialog.tsx`
- `src/features/accounts-payable/hooks/useSupplierBillForm.ts`
- `src/features/crm/components/CloseWonDialog.tsx`
- `src/features/inventory/lib/partFormSchema.ts` (3 ocurrencias)

Patrón de reemplazo:
```ts
// Antes (v3)
z.date({ required_error: "Fecha requerida" })
z.number({ invalid_type_error: "Monto inválido" })

// Después (v4)
z.date({ error: (iss) => iss.input === undefined ? "Fecha requerida" : "Fecha inválida" })
z.number({ error: "Monto inválido" })
```

### Paso 3 — Revisar `.transform().pipe()`
- `src/lib/schemas/common.ts` (rfc: `.transform().pipe(z.string().regex(...))`)
- `src/features/invoices/components/invoice-detail/PaymentIntentsSection.tsx`
- `src/features/accounts-payable/components/SupplierPaymentRejectDialog.tsx`
- `src/features/accounts-payable/components/RejectBillDialog.tsx`

Verificar que la inferencia de `z.infer<>` siga siendo `string` y que el resolver de RHF reciba el tipo correcto. Si hay ruido de tipos, migrar a:
```ts
z.string().min(3).transform(v => v.trim().toUpperCase()).refine(v => RFC_REGEX.test(v), "...")
```

### Paso 4 — Compilar iterativamente
- `tsgo` hasta 0 errores.
- Ajustar cualquier `z.infer` que quede desalineado por el cambio de `.default()` en v4 (usualmente basta con `z.infer<typeof s>` → `z.input<typeof s>` en el lado del formulario RHF si aparece un mismatch de tipos).

### Paso 5 — Verificación
- `bun run lint` (0 warnings — no romper el barrido reciente).
- `bunx vitest run` (804 tests deben seguir pasando).
- Smoke manual: abrir 2 formularios representativos (SupplierBill y Booking) en el preview y validar mensajes de error.

### Paso 6 — Changelog
- `public/changelog.json` + `public/changelog/v7.7.0.json` con nota **major dependency bump** describiendo Zod 4.

## Riesgos
- **Bajo/Medio**: la superficie con APIs realmente removidas es chica (≤15 archivos). El mayor riesgo es que algún `z.infer` cambie de shape por el nuevo tratamiento de `.default()`, lo que se detecta directo en `tsgo`.
- **Edge Functions (Deno)**: usan `zod` desde `deno.json`/`import_map`. Hay que subir también la versión ahí; el cambio es idéntico al del front.

## Fuera de alcance
- Migración a `z.email()` / `z.uuid()` como top-level (opcional, no breaking en v4).
- Cambios de estilo o refactors DRY adicionales.

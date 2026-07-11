# Auditoría de Zod — Estado actual

Ejecuté un barrido completo sobre `src/` y `supabase/functions/`. **La implementación está limpia y alineada con Zod 4.** Sólo detecté 3 mejoras cosméticas (todas LOW). No hay bugs ni deuda técnica real.

## Resultados del barrido

| Chequeo | Resultado |
|---|---|
| `zod` instalado | ✅ `4.4.3` |
| `@hookform/resolvers` | ✅ `5.4.0` |
| Edge functions con Zod en v4 | ✅ 1/1 (`classify-feedback-report@4.4.3`) |
| APIs eliminadas (`required_error`, `invalid_type_error`, `errorMap:`, `.deepPartial()`, `.nonempty()`, `z.function()`) | ✅ 0 usos |
| `.flatten()` deprecado | ✅ 0 usos (migrado a `z.treeifyError`) |
| `z.string().uuid()/.email()/.url()/.datetime()` (deprecados en v4) | ✅ 0 usos |
| Imports directos a `@hookform/resolvers/zod` | ✅ Sólo el wrapper `src/lib/forms/zodResolver.ts` |
| Locale es-MX global | ✅ `z.config(z.locales.es())` en `zodConfig.ts` |
| Barrel `@/lib/schemas` disponible | ✅ Creado |
| Tests | ✅ 843/843 verdes |

## Hallazgos (LOW)

**H1 — `useSupplierBillForm.ts` todavía usa `z.coerce.number()` ad-hoc**
Líneas 19-23: 5 campos declarados como `z.coerce.number().nonnegative(...)` en vez de las fábricas `positiveAmountCoerced()` / `nonNegativeAmountCoerced()` que introdujimos en `v7.8.0`.
- Impacto: inconsistencia con el catálogo DRY. Mensajes de error no unificados.
- Fix: sustituir por los helpers de `@/lib/schemas`.

**H2 — Barrel `@/lib/schemas` sub-utilizado**
9 archivos importan de `@/lib/schemas/common` directo vs 2 del barrel. El barrel existe pero no se está adoptando.
- Impacto: convención inconsistente; si mañana subdividimos `common.ts` habrá que tocar los 9.
- Fix: reemplazar los 9 imports por el barrel `@/lib/schemas`.

**H3 — `z.ZodTypeAny` en 2 tests**
`domain-schemas.test.ts:19` y `schemas.zodResolver.test.ts:19`. `ZodTypeAny` sigue funcionando en v4 pero la guía oficial recomienda `z.ZodType` genérico.
- Impacto: cosmético.
- Fix: sustituir por `z.ZodType`.

## Plan de ejecución

1. **H1** — `src/features/accounts-payable/hooks/useSupplierBillForm.ts`: importar `positiveAmountCoerced` y `nonNegativeAmountCoerced` desde `@/lib/schemas` y reemplazar las 5 líneas ad-hoc. Correr `schemas.zodResolver.test.ts` para confirmar contrato intacto.
2. **H2** — Reemplazar los 9 imports `from "@/lib/schemas/common"` por `from "@/lib/schemas"`.
3. **H3** — Sustituir `z.ZodTypeAny` por `z.ZodType` en los 2 tests.
4. Verificación final: `tsgo` + ESLint + Vitest completo.
5. Changelog `v7.8.1` (patch) documentando los tres ajustes.

## Sección técnica

Estimado: **< 50 LOC modificadas**, todo cambio superficial. Sin riesgo funcional: los tipos derivados (`z.infer`) se preservan porque las fábricas devuelven exactamente el mismo `ZodNumber` con `coerce`. La suite de 22 tests de `schemas.zodResolver.test.ts` cubre precisamente el pipeline coerce→positive/nonnegative usado en `useSupplierBillForm`.

¿Ejecuto los tres ajustes o prefieres que sólo aplique H1 (el único con valor DRY real) y deje H2/H3 como convenciones opcionales?

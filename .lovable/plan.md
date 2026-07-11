# Auditoría de la implementación de Zod 4

**Veredicto general:** limpia y consistente para un ERP de este tamaño. La migración está completa (0 usos de `required_error` / `invalid_type_error` / `errorMap:` / `.deepPartial()` / `.nonempty()` en el frontend), todos los formularios pasan por el wrapper único `@/lib/forms/zodResolver`, y hay una capa de schemas compartidos en `src/lib/schemas/common.ts` con tests. **No** está "top of the line" todavía: quedan 3 inconsistencias reales y ~5 oportunidades de pulido. Ninguna es crítica.

---

## Lo que está bien

- **1 sólo wrapper de resolver** (`src/lib/forms/zodResolver.ts`); ningún archivo importa `@hookform/resolvers/zod` directo.
- **APIs deprecadas de v3 = 0** en `src/`. Todo migrado a `error: '...'`.
- **Schemas compartidos** en `src/lib/schemas/common.ts`: `optionalEmail`, `rfcRequired`, `rfcOptional`, `clabeOptional`, `positiveAmount` — todos como fábricas (composables).
- **Tests de contrato** en `schemas.common.test.ts` (26 casos) y `accounts-payable/__tests__/schemas.zodResolver.test.ts` (22 casos).
- **37 archivos** consumen Zod, con patrón uniforme (`z.object({...})` + `type X = z.infer<typeof schema>`).

---

## Hallazgos — ordenados por severidad

### 🔴 HIGH — Edge Function fuera de sincronía

**1. `supabase/functions/classify-feedback-report/index.ts:1**` — Sigue en `zod@3.23.8` vía CDN y usa `parsed.error.flatten()` (deprecado). Es la **única** función edge que valida con Zod hoy; queda como isla de v3.

- Fix: subir a `zod@4` (esm.sh) y cambiar `flatten()` por `z.treeifyError()`. Riesgo: cambia la forma del payload de error que se loguea.

### 🟠 MEDIUM — Inconsistencias reales

**2. `src/lib/schemas/common.ts:27**` — `optionalEmail` usa `z.string().email()` (v3-style, deprecado en v4 en favor de `z.email()` como validador top-level más rápido y con mejor tree-shaking).

- Fix: `z.email().safeParse(v)` o directamente `z.email().or(z.literal(""))`. Bajo riesgo, misma semántica.

**3. Duplicación de `clabeOptional**` — `src/features/suppliers/components/suppliers/SupplierBankAccountFormDialog.tsx:36` reimplementa el refine de CLABE con mensaje propio en lugar de usar `clabeOptional()` de `common.ts`. Rompe DRY.

- Fix: reemplazar por `clabeOptional()` o exponer variante con mensaje custom.

**4. Postura numérica inconsistente**

- `useSupplierBillForm.ts:19-23` usa `z.coerce.number()` para 5 campos.
- `partFormSchema.ts:7-9` usa `z.coerce.number({ error })`.
- `positiveAmount()` en `common.ts` **explícitamente evita coerce** (comentario lo justifica), pero no hay una fábrica hermana `positiveAmountCoerced()` para casos donde el input viene como string.
- Resultado: cada feature decide su propio estilo; el newcomer no sabe cuál usar.
- Fix: definir 2 fábricas hermanas en `common.ts` (`positiveAmount`, `nonNegativeNumberCoerced`) y documentar cuándo usar cada una.

**5. Mezcla de `z.input<>` vs `z.infer<>**` — 9 componentes usan `z.input<typeof schema>` (RejectBillDialog, ReportTransferDialog, BankAccountFormDialog, etc.) y el resto usa `z.infer<>`. Es correcto en ambos casos (los que usan `.transform().pipe()` necesitan `z.input`), pero no está documentado ni obvio para el próximo desarrollador.

- Fix: comentario en `zodResolver.ts` con la regla ("usa `z.input` si tu schema tiene `.transform()`/`.pipe()`/`.default()` y quieres los tipos del formulario; `z.infer` (=`z.output`) para el payload post-validación").

### 🟡 LOW — Pulido / "top of the line"

**6. Sin `z.config(z.locales.es())**` — Zod 4 trae locales built-in con mensajes traducidos. Todo mensaje hoy está hardcoded en español por schema (~200 strings). Configurar el locale global reduce ~30% de mensajes redundantes.

- Fix: `import { es } from "zod/locales"; z.config({ locale: es() });` en `src/main.tsx`. Riesgo: algunos mensajes cambian de wording exacto — hay que revisar formularios visualmente o dejar overrides puntuales.

**7. Wrapper `zodResolver` usa `schema: any**` — El cast a `Resolver<Values>` funciona, pero perdemos inferencia si algún día alguien quiere `useForm<z.input, ctx, z.output>` (patrón recomendado por hookform para v4).

- Fix opcional: exponer segunda firma `zodResolverStrict<Schema>()` que preserve `Input/Output` para nuevos formularios que quieran adoptar el patrón moderno, sin romper los ~40 existentes.

**8. Sin barrel `src/lib/schemas/index.ts**` — Cada consumidor importa desde `@/lib/schemas/common`. Un barrel permitiría subdividir sin romper imports (ej: `common`, `money`, `fiscal`).

- Fix: crear `index.ts` que re-exporta y opcionalmente romper `common.ts` en `fiscal.ts` (RFC/CLABE), `contact.ts` (email), `money.ts` (positiveAmount).

**9. Cobertura de tests parcial** — Sólo `common.ts` + 2 schemas de AP tienen tests. Los otros ~15 schemas de dominio (bookings, quotes, invoices, deliveries, returns, damage, feedback, operations, customers, suppliers, forklift, part, maintenance, CRM Close*, portal) validan sólo en producción vía RHF.

- Fix: añadir suite genérica que itere sobre schemas exportados y valide `{ valid, invalid }` fixtures — patrón table-driven. Sirve también como documentación viva.

**10. `zodResolver.ts` — comentario source-map obsoleto** — El header dice "renombramos la import para evitar ambigüedad con nuestro export homónimo (algunas cadenas de source-map fusionaban ambos frames)". Ese bug ya no aplica en resolvers 5.x + Vite 5.

- Fix: limpiar comentario, dejar sólo la justificación del cast Input↔Output.

---

## Recomendación de sprint

Si querés cerrar la migración al 100% "clean", ejecutar en este orden:

1. **HIGH #1** — actualizar edge function a Zod 4 (10 min).
2. **MEDIUM #2, #3, #4** — 3 fixes puntuales, ~30 min total.
3. **LOW #6** — probar `z.locales.es()` en una rama y validar formularios (1-2 h).
4. **LOW #8, #9, #10** — refactor cosmético (1 h).

**Tiempo total estimado:** ~3-4 horas. Nada bloqueante, todo es pulido para dejar la implementación en estado "referencia".

---

**Nada de esto se implementa aún** — es sólo la auditoría. Decime cuáles hallazgos querés que ataque y en qué orden.

Vamos a corregir todos los a hallazgos
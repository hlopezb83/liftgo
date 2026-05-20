# Migración useFormState → react-hook-form

Auditoría dependency-audit identificó `useFormState` (9 LOC, 8 consumidores) como único helper de formularios que duplica la stack canónica §20.4 (`react-hook-form` + `zod`). El resto del codebase ya usa RHF para validaciones serias; este helper persiste solo como atajo de `useState` tipado.

## Objetivo

Eliminar `src/hooks/useFormState.ts` y migrar los 8 consumidores a `useForm` de `react-hook-form` + esquemas Zod, alineado con §20.4 y la regla "sin helpers redundantes" de §20.3.

## Estrategia

Migración **incremental por dominio**, no big-bang. Cada fase es un commit independiente, verificable, con changelog propio. El hook no se borra hasta la última fase.

### Fase 1 — Formularios simples (baja complejidad)
Consumidores con `<10` campos planos, sin lógica derivada compleja:
- `FiscalDataTab.tsx` (operations)
- `CompanyLogoTab.tsx` (operations)
- `DeliveryFormDialog.tsx` (deliveries)

**Patrón:** `useForm<Schema>({ resolver: zodResolver(schema), defaultValues })` + `<Form>` / `<FormField>` shadcn.

### Fase 2 — Hooks de formulario con submit handlers
Hooks que envuelven `useFormState` + mutación:
- `useMaintenanceForm.ts`
- `useReturnInspectionDialog.ts`

**Patrón:** retornar `form` (de RHF) + `onSubmit = form.handleSubmit(async (values) => mutate(values))`. Reemplazar `set`/`reset` por API nativa de RHF.

### Fase 3 — Formularios con estado derivado / efectos
Mayor complejidad por `useEffect` que reaccionan a cambios de campos:
- `CustomerFormDialog.tsx` (CSF import → `setForm` masivo)
- `useInvoiceFormState.ts` (CFDI nested state, `setCfdiForm` masivo)
- `useForkliftFormState.ts` (filtrado de modelos según manufacturer)

**Patrón:** `form.watch()` para reactividad + `form.reset(values)` para set masivo. Validar que el orden de efectos siga funcionando.

### Fase 4 — Limpieza
- Eliminar `src/hooks/useFormState.ts`
- Eliminar entrada en `dependency-audit.md` y `liftgo-dependency-audit.xlsx` (regenerar con script)
- Verificar `rg useFormState src` retorna vacío
- Changelog `v6.6.0-alpha.6` (minor: deuda técnica saldada)

## Esquemas Zod

Cada consumidor recibe un esquema co-ubicado (`<feature>/schemas/<form>Schema.ts`) con mensajes en español MX. Reutilizar validaciones existentes si ya hay un esquema parcial en el dominio.

## Detalles técnicos

- **`form.watch()` vs `form.getValues()`**: usar `watch` solo donde la UI dependa reactivamente; `getValues` en submit handlers.
- **`setForm(prev => ...)` patrones**: migrar a `form.reset({ ...form.getValues(), ...patch })` o `form.setValue` por campo.
- **Tipos**: derivar `type FormValues = z.infer<typeof schema>` — elimina genéricos manuales del helper actual.
- **Power of 10**: cada hook migrado debe quedar ≤80 LOC; componentes ≤150 LOC. Si excede, partir.
- **Sin `any`/`!`/`as`**: RHF tipa todo end-to-end vía Zod resolver.

## Out of scope

- No tocar formularios que ya usan RHF.
- No cambiar UX ni validaciones existentes (paridad funcional estricta).
- No introducir nuevos campos ni refactor de submit logic.
- No tocar tests existentes salvo ajuste de imports/mocks.

## Verificación por fase

1. Build limpio (sin warnings).
2. Smoke manual del formulario migrado en preview.
3. Tests existentes pasan (`bunx vitest run <feature>`).
4. `rg "useFormState" src` muestra consumidores restantes decrecientes.

## Entregables finales

- 8 archivos migrados + esquemas Zod nuevos.
- `src/hooks/useFormState.ts` eliminado.
- `docs/dependency-audit.md` y xlsx regenerados.
- 4 entradas de changelog (una por fase) culminando en `v6.6.0-alpha.6`.

## Riesgo

**Medio.** Fase 3 es la sensible (estado derivado en CSF import e Invoice CFDI). Mitigación: fases independientes, rollback trivial por commit.

## Decisión solicitada

¿Apruebas el plan completo (4 fases en este loop) o prefieres ejecutar **solo Fase 1** ahora para validar el patrón antes de continuar?

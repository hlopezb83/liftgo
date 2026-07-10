## Objetivo
Formalizar el principio DRY en la memoria del proyecto, al mismo nivel que `Power of 10`, para que futuras sesiones reutilicen el ecosistema construido en los Lotes 1-9 antes de escribir código nuevo.

## Cambios

### 1. Actualizar `mem://index.md` (sección Core)
Agregar una línea corta y accionable:

> Antes de crear código nuevo, buscar helper existente: `useEntityMutation`, `createEntityKeys`, `FormDialog` + field wrappers, `_shared/*` en edge functions, `lib/schemas/common`, `lib/money`, `toYMD`/`nowMty`. Duplicar sólo con justificación explícita.

Y agregar la referencia al nuevo archivo en la sección Memories:
> - [DRY Principles](mem://arch/dry-principles) — Catálogo de helpers reutilizables y cuándo usarlos

### 2. Crear `mem://arch/dry-principles`
Memoria tipo `preference` con 10 reglas concretas, cada una con **helper canónico** + **anti-patrón a evitar**:

1. **Mutations CRUD** → `useEntityMutation` (no `useMutation` crudo con toast/invalidate manual).
2. **Query keys** → `createEntityKeys(entity)` (no arrays literales `['entity', id]` dispersos).
3. **Formularios en dialog** → `FormDialog` + `src/components/forms/fields/*` (no `<Dialog>` + `<form>` + `<Input>` manual).
4. **Validación** → RHF + Zod usando `src/lib/schemas/common.ts` (uuid, money, dateYMD, nn).
5. **Dinero** → `formatCurrency` y `toMxn` desde `src/lib/money/` (no `Intl.NumberFormat` inline).
6. **Fechas** → `nowMty()`, `toYMD()`, `formatMonthEs()` (no `new Date()` ni `toISOString().slice(0,10)`).
7. **Edge Functions clientes** → `getAdminClient()` / `getCallerClient(req)` de `_shared/supabaseClients.ts` (no `createClient` + `Deno.env.get` manual).
8. **Edge Functions responses** → `jsonResponse` / `jsonError` de `_shared/http.ts` (no `new Response(JSON.stringify(...))` con CORS manual).
9. **Reglas de dominio** → `src/lib/rules/*` (quotes, invoices) — no re-implementar validaciones de estado en componentes.
10. **UI compuesta** → `DetailRow`, `KpiTile`, `ReportChartCard`, `MobileCardList`, `DetailPageHeader`, `TotalsSummary` (no maquetar KPIs/tarjetas desde cero).

Cada regla en formato:
```
### N. Título
**Usar:** helper/path
**Evitar:** anti-patrón
**Por qué:** razón breve
```

Cierre con nota: *"Si necesitas duplicar, primero considera extender el helper existente. Documenta la excepción en el PR/changelog."*

### 3. Aplicar vía tool de memoria
Dos writes en paralelo:
- Sobrescribir `mem://index.md` con Core actualizado + nueva entrada en Memories.
- Crear `mem://arch/dry-principles` con frontmatter `type: preference` y el contenido de las 10 reglas.

## Fuera de alcance
- No se modifica código de la app.
- No se crea entrada de changelog (esto es memoria del agente, no un cambio funcional del producto).
- No se toca `Power of 10` existente; DRY queda como memoria hermana complementaria.

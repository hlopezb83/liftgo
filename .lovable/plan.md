## Objetivo

Aplicar §20 al primer caso claro: **eliminar el sistema de toasts duplicado** (`shadcn/use-toast` + `@radix-ui/react-toast` + `<Toaster>`) consolidando todo en `sonner`, que ya es la dependencia canónica (§20.4) y se usa en 84 archivos.

## Hallazgo

Coexisten dos stacks de notificación:

- **Canónico (§20.4):** `sonner` — 84 consumidores, integrado vía `<Sonner />` en `AppProviders.tsx`.
- **Residual (shadcn legacy):** `hooks/use-toast.ts` (186 LOC) + `components/ui/toast.tsx` + `components/ui/toaster.tsx` + `@radix-ui/react-toast`. Solo **1 consumidor real**: `src/features/crm/hooks/useProspectGuard.ts`.

Mantener ambos viola §20.7 ("wrappers triviales / duplicación del stack canónico") y §17 (anti-patrón añadido en alpha.2).

## Acciones

1. **Migrar el único consumidor**: `src/features/crm/hooks/useProspectGuard.ts` cambia `import { toast } from "@/hooks/use-toast"` → `import { toast } from "sonner"` y adapta la(s) llamada(s) al API de sonner (`toast.error(title, { description })` en vez de `toast({ title, description, variant })`).

2. **Eliminar archivos legacy**:
   - `src/hooks/use-toast.ts`
   - `src/components/ui/toast.tsx`
   - `src/components/ui/toaster.tsx`

3. **Limpiar render del Toaster legacy** si está montado en `AppProviders.tsx` (verificar y, si existe, remover `<Toaster />` shadcn dejando solo `<Sonner />`).

4. **Remover dependencia**: `bun remove @radix-ui/react-toast`.

5. **Verificar**:
   - `rg "use-toast|@/components/ui/toast(er)?|@radix-ui/react-toast" src` → 0 resultados.
   - Build limpio sin warnings.
   - Test rápido en `/crm` que el toast de prospect-guard se renderice.

6. **Changelog**: nueva entrada `refactor` `6.6.0-alpha.3` en `public/changelog.json` + `public/changelog/v6.6.0-alpha.3.json` documentando el primer caso de aplicación de §20 (retiro de wrapper legacy, consolidación en `sonner`).

## Fuera de alcance (follow-ups posibles)

- **`useFormState` → `react-hook-form`**: 7 dialogs/forms lo usan. Migración mayor, mejor en PR aparte.
- **`useDebouncedValue` → `use-debounce`**: cabe en la excepción §20.3 (glue <30 LOC); no se migra.
- **Resto de utilidades de `lib/` y `hooks/`**: auditadas — no duplican stack canónico (ver tabla en el mensaje previo).

## Riesgo

Bajo. Cambio mecánico: 1 import a migrar, 3 archivos a eliminar, 1 dependencia removida. Si algún archivo todavía importara los legacy, el typecheck del build los detecta.

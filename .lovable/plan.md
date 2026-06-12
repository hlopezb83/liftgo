# Auditoría de Arquitectura — LiftGo ERP

## Veredicto general

La arquitectura está en muy buen estado. Confirmado:

- **Tamaño de archivos**: ningún archivo de producto supera 300 líneas (el más grande es `ListPageLayout.tsx` con 251). Solo `src/integrations/supabase/types.ts` es enorme (3,675), pero es auto-generado y no se toca.
- **Separación por feature**: las 29 features siguen el mismo patrón `components/ + hooks/ + lib/ + pages/`. Consistente.
- **Sin fugas de datos en UI**: cero `supabase.from(...)` dentro de `*Page.tsx`, `*Dialog.tsx` o `src/components/`. Toda lectura/escritura pasa por hooks de dominio.
- **Higiene**: 0 `TODO/FIXME`, 0 `console.log`, 1 solo uso de `any`. `useEffect` con cleanup, paginación, zod, sonner globales: todo aplicado.
- **Documentación viva**: changelog versionado y `mem://` actualizado.

Lo que sigue son oportunidades de mejora reales, no errores. Ordenadas por impacto.

---

## Hallazgos priorizados

### CRÍTICO

Ninguno. No hay riesgo arquitectónico inmediato.

### ALTO

**1. Acoplamiento centrípeto en `fleet`, `invoices`, `customers`**

`src/features/fleet` es importado **78** veces desde otras features; `invoices` 68, `crm` 58, `customers` 55, `bookings` 53. Eso es normal porque son entidades centrales, pero hoy esas features exponen su superficie completa (hooks internos, tipos, componentes) sin un `index.ts` que actúe como contrato público. Cualquier refactor interno de `fleet` puede romper consumidores remotos sin que el compilador lo señale como ruptura de API.

> Riesgo si no se atiende: cambios internos rompen features lejanas; refactors se vuelven caros.
> Fix: definir un `src/features/<feature>/index.ts` (barrel acotado) que reexporte solo lo que es público (hooks de lectura, tipos, selectores). Marcar el resto como interno mediante regla ESLint `no-restricted-imports` que prohíba importar rutas profundas entre features.

**2. La feature `invoices` está rozando el límite de complejidad**

31 archivos de hooks divididos en `invoices/`, `invoiceDetail/`, `invoiceForm/`, `creditNotes/`, más 8 hooks sueltos en la raíz (`useCancelCfdi`, `useCollectionNotes`, `useGenerateRecurringInvoices`, `usePaymentComplement`, `useInvoicePdfDownload`, `useInvoicesWithBalance`, `useNextInvoiceNumber`, `usePayments`). Es la única feature donde la organización ya no es obvia.

> Riesgo: dificulta encontrar el hook correcto, fomenta duplicación accidental.
> Fix: mover los 8 hooks sueltos a subcarpetas temáticas (`cfdi/`, `payments/`, `recurring/`, `pdf/`) y documentar el árbol en `mem://features/invoicing`.

**3. Sin convención centralizada de `queryKey`**

Cada hook arma su propio array literal (`["invoices", id]`). No hay un `queryKeys.ts` por feature. Eso ya causó (y puede volver a causar) invalidaciones desincronizadas: una mutación invalida `["invoices"]` y otra `["invoices","list"]` y la UI no se refresca.

> Riesgo: bugs intermitentes de caché stale.
> Fix: crear `src/features/<feature>/lib/queryKeys.ts` con factories tipadas (`invoiceKeys.list(filters)`, `invoiceKeys.detail(id)`) y migrar incrementalmente. Patrón estándar de TanStack Query.

### MEDIO

**4. `src/components/` mezcla primitivas de UI y componentes de dominio**

En la raíz conviven primitivas neutrales (`SearchBar`, `EmptyState`, `TablePagination`, `StatusBadge`) con componentes que conocen reglas de negocio (`DetailPageHeader`, `ListPageLayout` 251 líneas, `TotalsSummary`, `ReadOnlyLineItemsTable`, `NotesCard`). Hoy todo está en un solo nivel.

> Riesgo: difícil saber qué es seguro reutilizar vs. qué arrastra dependencias.
> Fix: dividir en `src/components/ui-ext/` (primitivas extendidas sobre shadcn) y `src/components/layout/` (layouts compuestos de página). Cero cambio de comportamiento, solo movimientos + actualización de imports.

**5. Hooks de feature duplicando patrón "list + filters + dialog"**

Cada feature implementa su propia composición de `useListPage + useListFilters + useDialogState + useQuery`. Ya existen los hooks genéricos en `src/hooks/`, pero la "receta" se reescribe en cada `*Page.tsx`. Hay >25 páginas con el mismo molde.

> Riesgo: divergencia sutil de comportamiento (un `Page` debounce 300ms, otro 500ms, etc.).
> Fix: extraer `useResourceList<T>({ queryKey, fetcher, filterDefs })` en `src/hooks/`. Migrar página por página, no big-bang.

**6. Cross-imports profundos en lugar de barrels**

Búsquedas muestran imports tipo `@/features/fleet/hooks/forklifts/useForklifts`. Es válido pero frágil: mover un archivo dentro de `fleet` rompe imports remotos.

> Fix: misma solución que el hallazgo 1 (barrels + ESLint).

### BAJO / OPCIONAL

**7. `src/lib/pdf/theme/styles.ts` con 360 líneas**

Único archivo de `lib/` que se acerca al límite. Dividir por sección (`tableStyles`, `headerStyles`, `colors`) ayuda a la legibilidad. No urgente.

**8. 3 archivos llamados `constants.ts`** en distintas features

No es duplicación, pero conviene auditar que cada uno solo contenga constantes de su dominio y no constantes globales que deberían vivir en `src/lib/constants.ts`.

**9. `quotes/` tiene `utils/` además de `lib/`**

Es la única feature con esa duplicidad de carpeta. Consolidar a `lib/` para mantener consistencia con el resto.

**10. Sin index de tipos por feature**

Los tipos se importan desde archivos individuales. Un `src/features/<feature>/types.ts` por feature mejora descubribilidad. Opcional.

---

## Plan de acción ordenado

| # | Acción | Esfuerzo | Impacto | Riesgo de regresión |
|---|--------|----------|---------|---------------------|
| 1 | Crear `queryKeys.ts` por feature (empezando por `invoices`, `bookings`, `fleet`) y migrar hooks | Medio | Alto | Bajo |
| 2 | Definir barrels `index.ts` públicos en `fleet`, `invoices`, `customers`, `crm`, `bookings` + regla ESLint `no-restricted-imports` para imports profundos cross-feature | Medio | Alto | Bajo |
| 3 | Reorganizar hooks de `invoices` en subcarpetas (`cfdi/`, `payments/`, `recurring/`, `pdf/`) | Bajo | Medio | Bajo |
| 4 | Dividir `src/components/` en `ui-ext/` (primitivas) y `layout/` (compuestos) | Bajo | Medio | Bajo (solo mover + actualizar imports) |
| 5 | Extraer hook genérico `useResourceList` y migrar 2-3 páginas piloto | Medio | Medio | Medio (validar UX por página) |
| 6 | Consolidar `quotes/utils` dentro de `quotes/lib` | Bajo | Bajo | Bajo |
| 7 | Dividir `src/lib/pdf/theme/styles.ts` por sección | Bajo | Bajo | Muy bajo |
| 8 | Auditar los 3 `constants.ts` y mover globales reales a `src/lib/constants.ts` | Bajo | Bajo | Bajo |
| 9 | Añadir `types.ts` público por feature | Bajo | Bajo (DX) | Muy bajo |

---

## Cómo continuar

Si apruebas, puedo arrancar por los puntos **1, 2 y 3** que son los que más reducen el riesgo de regresiones futuras sin tocar UI ni lógica de negocio. Los demás los podemos agendar como mejoras incrementales.

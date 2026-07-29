# Paginación por cursor: patrón de referencia y disparador de migración

## Contexto

La mayoría de los listados del ERP usan un límite fijo (`LIST_PAGE_LIMIT`,
definido en `src/lib/supabase/constants.ts`, actualmente **500 filas**) con
`.order(...).limit(LIST_PAGE_LIMIT)`. Cuando una tabla alcanza ese tope,
`hasReachedListLimit()` marca la lista como potencialmente truncada y la
página muestra un aviso (`Alert`) pidiendo al usuario refinar filtros — nunca
se trunca en silencio.

Ese patrón es simple y funciona bien mientras el volumen de filas se mantenga
muy por debajo del límite. Cuando un módulo empieza a tocar el límite de forma
habitual, el límite fijo deja de ser suficiente y conviene migrar a
**paginación por cursor** (`range()` + `useInfiniteQuery`).

## Patrón de referencia: `useInvoicesInfinite`

Implementado en `src/features/invoices/hooks/invoices/useInvoices.ts:169`.
Piezas clave:

1. **Tamaño de página explícito**, menor que `LIST_PAGE_LIMIT`:
   ```ts
   export const INVOICE_PAGE_SIZE = 100;
   ```

2. **Fetch por página usando `range()`** (no `limit()`), calculando el
   cursor a partir del índice de página:
   ```ts
   async function fetchInvoicePage(filters: InvoiceListFilters, pageIndex: number) {
     const from = pageIndex * INVOICE_PAGE_SIZE;
     const to = from + INVOICE_PAGE_SIZE - 1;
     const { data, error } = await baseInvoiceQuery(filters)
       .order("created_at", { ascending: false })
       .range(from, to)
       .returns<InvoiceRow[]>();
     if (error) throw error;
     const rows = data ?? [];
     return { rows, nextPage: rows.length === INVOICE_PAGE_SIZE ? pageIndex + 1 : undefined };
   }
   ```
   El cursor "hay más páginas" se infiere de si la página vino completa
   (`rows.length === INVOICE_PAGE_SIZE`); no requiere un cursor basado en
   columnas siempre que el `order()` sea estable (aquí `created_at desc`,
   con `id` como desempate implícito por PK si hiciera falta exactitud total).

3. **`useInfiniteQuery` con los filtros como parte de la queryKey**, para que
   cambiar de filtro reinicie la paginación automáticamente:
   ```ts
   export function useInvoicesInfinite(filters?: InvoiceListFilters) {
     const normalized = createInvoiceListFilters(filters);
     return useInfiniteQuery({
       queryKey: [...createInvoiceListQueryKey(normalized), "infinite"],
       queryFn: ({ pageParam }) => fetchInvoicePage(normalized, pageParam as number),
       initialPageParam: 0,
       getNextPageParam: (last) => last.nextPage,
       staleTime: INVOICE_STALE_MS,
       placeholderData: (prev) => prev,
     });
   }
   ```
   `placeholderData: (prev) => prev` evita parpadeo/vacío en la tabla al
   cambiar filtros o buscar mientras llega la nueva página.

4. **Convive con la query "lista completa"** (`useInvoices`, con
   `LIST_PAGE_LIMIT`) para consumidores que no necesitan scroll infinito
   (exports, selects, dashboards). No hace falta migrar todo el módulo de
   golpe.

## Disparador explícito de migración

**No se migra un módulo "por si acaso".** El criterio es:

> Se migra un módulo a paginación por cursor cuando su aviso de truncamiento
> (`hasReachedListLimit` + `Alert` de "Mostrando los primeros N registros…")
> **aparece de forma habitual** en el uso real (no como caso aislado o de
> datos de prueba).

Mientras el aviso no aparezca en operación normal, el límite fijo +
`LIST_PAGE_LIMIT` sigue siendo la opción más simple y de menor mantenimiento.

## Módulos candidatos a revisar

Listados que hoy usan `LIST_PAGE_LIMIT` fijo y son candidatos a monitorear /
migrar si su aviso de truncamiento se vuelve habitual:

- **Cotizaciones** (`useQuotes`, `src/features/quotes/hooks/quotes/useQuotes.ts`)
- **Cuentas por pagar (CxP)** (`src/features/accounts-payable`)
- **Líneas bancarias / conciliación bancaria** (`useBankStatementLines`,
  `src/features/bank-reconciliation`)
- **Flota** (`useForklifts`, `src/features/fleet`)
- **Mantenimiento** (`src/features/maintenance`)

Antes de migrar cualquiera de estos, confirmar que el aviso de truncamiento
aparece recurrentemente para usuarios reales (no sólo en datos de prueba/E2E),
y evaluar si conviene mantener también una variante "lista completa liviana"
(ver `useQuotesLite`) para los consumidores que sólo necesitan pocas columnas.

# Auditoría TanStack (Query + Table + Virtual)

## Estado actual


| Paquete                   | Instalada | Última  | Estado   |
| ------------------------- | --------- | ------- | -------- |
| `@tanstack/react-query`   | 5.101.2   | 5.101.2 | ✅ al día |
| `@tanstack/react-table`   | 8.21.3    | 8.21.3  | ✅ al día |
| `@tanstack/react-virtual` | 3.14.5    | 3.14.5  | ✅ al día |


**106** hooks usan React Query; **50** archivos usan `useEntityMutation`; existe `createEntityKeys` como factory de query keys.

## Lo que está limpio ✅

- **QueryClient centralizado** en `AppProviders.tsx` con `staleTime`, `gcTime`, `retry`, `refetchOnWindowFocus:false` y `QueryCache`/`MutationCache` con `meta.silent` para toasts globales.
- **Factory de query keys** (`createEntityKeys`) con niveles `all/lists/details/detail`.
- **Abstracción `useEntityMutation**` para invalidaciones consistentes (DRY).
- **AuthQueryCacheSync**: limpieza de cache al cambio de sesión.

## Lo que NO está top-of-the-line ⚠️

1. `**queryOptions()` v5 sin adoptar** — 0 usos. Es el idiom oficial de v5 para colocar `queryKey + queryFn + select` en un solo objeto tipado (habilita `prefetchQuery`, `ensureQueryData`, `useSuspenseQuery` con el mismo contrato).
2. **Sin `useSuspenseQuery` / `useSuspenseQueries**` — 0 usos. Ya hay `Suspense` por ruta (Fase F Lote 3) pero los datos siguen con `isLoading` manual → skeletons duplicados.
3. **Sin `prefetchQuery` / `ensureQueryData**` — 0 usos. `useNavigateTransition` navega en transición pero no precalienta cache en hover/focus (patrón "prefetch on intent").
4. **Sin `ReactQueryDevtools**` — DX inferior; solo en `import.meta.env.DEV`.
5. **Sin `useInfiniteQuery` ni `useQueries**` — listas grandes paginan client-side (25) sobre datasets completos; oportunidad para tablas con paginación server-side.
6. `**select:` infrautilizado** (2 usos) — la mayoría transforma en el consumidor, gastando renders y sin cachear la proyección.
7. `**isLoading` vs `isPending` mezclado** — semántica v5 confusa (`isLoading = isPending && isFetching && !data`, pero `isPending` es el estado real "sin data aún"); usar `isPending` es la recomendación oficial.
8. **Optimistic UI solo con `useOptimistic**` (React 19) — `onMutate`/`setQueryData`/rollback con `context` sigue siendo superior para invalidación cruzada (ej: eliminar factura y ajustar KPIs del dashboard).
9. **Sin `persistQueryClient**` — cold start recarga todo; el usuario ya reportó querer fluidez.
10. `**react-table` sin `@tanstack/match-sorter-utils**` para filtrado difuso global; hoy se filtra manualmente en `useListFilters`.

---

## Plan propuesto — 4 lotes

### Lote 1 — Fundacional (DX + tipos) — bajo riesgo

- Instalar `@tanstack/react-query-devtools` y montar `<ReactQueryDevtools />` gated por `import.meta.env.DEV` en `AppProviders`.
- Crear `src/lib/query/defineEntityQueries.ts`: helper que envuelve `queryOptions()` combinándolo con `createEntityKeys` para exponer `list(filter)`, `detail(id)` tipados y reutilizables entre `useQuery`, `prefetchQuery` y `useSuspenseQuery`.
- Migrar 3 hooks piloto (`useContracts`, `useDeliveries`, `useQuotes`) a `queryOptions()` sin cambiar consumidores.
- Codemod ligero `isLoading → isPending` donde no dependa de refetch (excluye guards que sí necesitan `isFetching`).

### Lote 2 — Prefetch on intent — impacto UX alto

- Extender `useNavigateTransition` para aceptar `prefetch: () => queryOptions` opcional y llamar `queryClient.prefetchQuery` en `onMouseEnter`/`onFocus`.
- Aplicar en filas de listas críticas: Cotizaciones, Reservas, Facturas, Mantenimiento, CRM, Clientes, Flota, Proveedores.
- Detalle abre "instantáneo" cuando el usuario ya pasó por encima 150 ms.

### Lote 3 — Suspense + select — reduce boilerplate

- Migrar rutas de detalle (Quote/Booking/Invoice/Contract/Forklift Detail) a `useSuspenseQuery`, eliminando `isLoading`/skeletons duplicados por el `Suspense` de ruta.
- Empujar transformaciones (mapeos, ordenamientos, cálculos) a `select:` colocado en el `queryOptions`, cacheado por referencia.

### Lote 4 — Persistencia + optimismo profundo (opcional, evaluar)

- Instalar `@tanstack/query-sync-storage-persister` + `persistQueryClientProvider` con whitelist de queries (dashboards, KPIs, catálogos) y `maxAge: 24h`. Excluir queries sensibles (roles, secretos).
- Convertir 3 mutaciones de alto tráfico (cambio de status de reserva, marca de pago, aprobación de gasto) a `onMutate`/`setQueryData`/rollback vía extensión de `useEntityMutation` (`optimistic: (old, vars) => next`).

---

## Detalles técnicos

- `queryOptions()` requiere `@tanstack/react-query` ≥ 5.28 → ya cubierto.
- Devtools: `bun add -D @tanstack/react-query-devtools`.
- Persister: `bun add @tanstack/query-sync-storage-persister @tanstack/react-query-persist-client`.
- Codemod `isLoading→isPending`: script Python que solo reemplaza el destructuring de `useQuery`/`useSuspenseQuery`, respeta `isFetching`/`isRefetching`. Verificación con `bunx tsgo --noEmit` + `bunx vitest run`.
- Sin cambios en `AppProviders.tsx` salvo agregar `<ReactQueryDevtools />` y (Lote 4) envolver con `PersistQueryClientProvider`.
- Sin cambios en RLS/backend, sin cambios visuales fuera del Devtools flotante en dev.

## Estimación


| Lote | Archivos tocados | Riesgo     | Ganancia                                   |
| ---- | ---------------- | ---------- | ------------------------------------------ |
| 1    | ~8               | bajo       | Tipado + DX                                |
| 2    | ~20              | bajo       | UX percibida (navegación instantánea)      |
| 3    | ~15              | medio      | −200 LOC skeletons, código más declarativo |
| 4    | ~10              | medio-alto | Cold start + optimismo                     |


## Recomendación

Ejecutar **Lote 1 + Lote 2** ahora (bajo riesgo, alto retorno). Evaluar Lote 3/4 después de medir impacto real.

¿Arrancamos con Lote 1 + 2, o prefieres los 4 completos? Los 4
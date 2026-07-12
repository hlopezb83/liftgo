/**
 * Re-export de `useSuspenseQuery` + `useSuspenseQueries` de TanStack Query v5.
 *
 * Cuando una pantalla ya tiene un `<Suspense fallback={...}>` en su árbol,
 * migrar de `useQuery` a `useSuspenseQuery` elimina el estado `isLoading`
 * de la vista (data pasa a ser `T`, nunca `undefined`), simplifica JSX y
 * hace que Suspense sea el único responsable del skeleton.
 *
 * Convenciones LiftGo:
 *   - Sólo migrar rutas envueltas por `<Suspense>` en `src/App.tsx`.
 *   - Combina con `defineEntityQueries`:
 *       const { data } = useSuspenseQuery(quoteQueries.detail(id));
 *   - NO usar en hooks compartidos por múltiples pantallas: usa `useQuery`
 *     ahí para preservar retro-compat.
 */
export {
  useSuspenseQuery,
  useSuspenseQueries,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";

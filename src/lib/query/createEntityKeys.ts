/**
 * Factory de query keys estables para TanStack Query.
 *
 * Reemplaza tuplas ad-hoc como `["contracts"]`, `["contracts", id]`,
 * `["deliveries", "detail", id]` — variantes divergentes que causan invalidaciones
 * silenciosamente rotas al mutar (typo o segmento faltante = cache stale).
 *
 * Uso:
 *   export const contractKeys = createEntityKeys("contracts");
 *   contractKeys.all           // ["contracts"] as const
 *   contractKeys.lists()       // ["contracts", "list"] as const
 *   contractKeys.byFilter({ status: "draft" })  // ["contracts", "list", { status: "draft" }] as const
 *   contractKeys.details()     // ["contracts", "detail"] as const
 *   contractKeys.detail(id)    // ["contracts", "detail", id] as const
 *
 * Invalidación por scope:
 *   qc.invalidateQueries({ queryKey: contractKeys.all });       // toda la feature
 *   qc.invalidateQueries({ queryKey: contractKeys.lists() });   // solo listados
 *   qc.invalidateQueries({ queryKey: contractKeys.detail(id) }); // 1 registro
 */

export interface EntityKeys<Root extends string> {
  readonly all: readonly [Root];
  readonly lists: () => readonly [Root, "list"];
  readonly byFilter: (filter: Readonly<Record<string, unknown>>) => readonly [Root, "list", Readonly<Record<string, unknown>>];
  readonly details: () => readonly [Root, "detail"];
  readonly detail: (id: string) => readonly [Root, "detail", string];
}

export function createEntityKeys<Root extends string>(root: Root): EntityKeys<Root> {
  return {
    all: [root] as const,
    lists: () => [root, "list"] as const,
    byFilter: (filter) => [root, "list", filter] as const,
    details: () => [root, "detail"] as const,
    detail: (id: string) => [root, "detail", id] as const,
  };
}

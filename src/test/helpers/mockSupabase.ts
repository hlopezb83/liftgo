import { vi, type Mock } from "vitest";

/**
 * Tipo flexible para representar respuestas de Supabase en tests.
 * Evita el uso de `any` en mocks manteniendo expresividad.
 */
export type SupabaseResponse<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

/**
 * Tipo de un mock de query encadenable. Permite cubrir
 * los métodos chainables más usados (select, eq, single, etc.)
 * sin requerir tipar la totalidad del cliente Supabase.
 */
export type ChainableQueryMock = {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  eq: Mock;
  in: Mock;
  order: Mock;
  limit: Mock;
  single: Mock;
  maybeSingle: Mock;
};

/**
 * Crea un mock encadenable donde cada método retorna el propio mock,
 * salvo `single`/`maybeSingle` que resuelven con la respuesta dada.
 */
export function createChainableQuery<T = unknown>(
  response: SupabaseResponse<T> = { data: null, error: null },
): ChainableQueryMock {
  const chain = {} as ChainableQueryMock;
  const methods: Array<keyof ChainableQueryMock> = [
    "select", "insert", "update", "delete", "eq", "in", "order", "limit",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(response));
  chain.maybeSingle = vi.fn(() => Promise.resolve(response));
  return chain;
}

/**
 * Tipo mínimo para un cliente Supabase mockeado.
 */
export interface MockSupabaseClient {
  from: Mock;
  rpc: Mock;
}

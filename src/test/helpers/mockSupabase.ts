import { type Mock } from "vitest";

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

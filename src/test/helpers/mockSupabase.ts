/**
 * Tipo flexible para representar respuestas de Supabase en tests.
 * Evita el uso de `any` en mocks manteniendo expresividad.
 */
export type SupabaseResponse<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

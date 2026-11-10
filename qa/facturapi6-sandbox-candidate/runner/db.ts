// Tipos estructurales mínimos del cliente de base de datos que usa el
// ejecutor. Evitan `any` sin depender de los tipos completos de supabase-js.

export interface DbResult {
  data: unknown;
  error: unknown;
}

export interface Query extends PromiseLike<DbResult> {
  select(cols: string, ...rest: unknown[]): Query;
  eq(col: string, value: unknown): Query;
  neq(col: string, value: unknown): Query;
  limit(n: number): Query;
  maybeSingle(): PromiseLike<DbResult>;
}

export interface Db {
  from(table: string): Query;
}

export interface CallerClientLike {
  auth: {
    getClaims: (
      token: string,
    ) => Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
    getUser: (
      token: string,
    ) => Promise<{ data: { user: { id?: unknown } | null } | null; error: unknown }>;
  };
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

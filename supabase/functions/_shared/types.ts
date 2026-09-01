// Tipos compartidos para handlers de Edge Functions (Supabase client mínimo).
// Antes vivían en stamp-cfdi/handler.ts y los importaban supabaseClientMock.ts
// y stamp-credit-note/handler.ts — un cambio en stamp-cfdi rompía toda la
// suite en cascada. Centralizar aquí desacopla los mocks de cualquier handler.

export interface QueryBuilderLike {
  select: (
    cols?: string,
    opts?: Record<string, unknown>,
  ) => QueryBuilderLike;
  insert: (rows: unknown) => QueryBuilderLike;
  update: (patch: Record<string, unknown>) => QueryBuilderLike;
  eq: (col: string, val: unknown) => QueryBuilderLike;
  in: (col: string, vals: unknown[]) => QueryBuilderLike;
  is: (col: string, val: unknown) => QueryBuilderLike;
  neq: (col: string, val: unknown) => QueryBuilderLike;
  not: (col: string, op: string, val: unknown) => QueryBuilderLike;
  order: (col: string, opts?: Record<string, unknown>) => QueryBuilderLike;
  limit: (n: number) => QueryBuilderLike;

  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: <T>(
    onfulfilled: (
      v: { data: unknown; error: unknown; count?: number | null },
    ) => T,
  ) => Promise<T>;
}

export interface SupabaseLike {
  auth: {
    getClaims: (
      token: string,
    ) => Promise<
      { data: { claims?: { sub?: string } } | null; error: unknown }
    >;
  };
  from: (table: string) => QueryBuilderLike;
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Blob | Uint8Array,
        opts?: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
    };
  };
}

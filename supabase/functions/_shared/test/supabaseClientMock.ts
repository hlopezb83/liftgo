// Lightweight Supabase client mock for Deno tests.
// Configure per-table responses, then build a SupabaseLike via buildClient().
import type { QueryBuilderLike, SupabaseLike } from "../types.ts";

export interface TableResponse {
  data: unknown;
  error: unknown;
}

export interface MockUpdate {
  table: string;
  patch: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

export interface MockInsert {
  table: string;
  row: unknown;
}

export interface MockConfig {
  // claims crudos del JWT (sub, role, email...). null = token inválido.
  claims?: ({ sub?: string } & Record<string, unknown>) | null;
  claimsError?: unknown;
  // keyed by table name: response for select-chains (single/maybeSingle/await)
  selects?: Record<string, TableResponse>;
  // keyed by table name: response for update-chains
  updates?: Record<string, TableResponse>;
  // v7.222.0 (Auditoría Tests T6#6): respuestas secuenciadas por tabla para
  // simular claims atómicos concurrentes — 1ª llamada devuelve data, 2ª null.
  // Consumidas FIFO; al agotarse cae en `updates[table]`.
  updatesSeq?: Record<string, TableResponse[]>;
  // storage upload result, keyed by bucket
  storage?: Record<string, { error: unknown }>;
  // keyed by rpc function name: response for supabase.rpc(...)
  rpcs?: Record<string, TableResponse>;
}

export interface MockState {
  client: SupabaseLike;
  updates: MockUpdate[];
  inserts: MockInsert[];
  uploads: Array<{ bucket: string; path: string }>;
}

export function buildSupabaseMock(cfg: MockConfig): MockState {
  const state: MockState = {
    client: undefined as unknown as SupabaseLike,
    updates: [],
    inserts: [],
    uploads: [],
  };

  const selects = cfg.selects ?? {};
  const updates = cfg.updates ?? {};
  const updatesSeq: Record<string, TableResponse[]> = {};
  for (const [k, v] of Object.entries(cfg.updatesSeq ?? {})) {
    updatesSeq[k] = [...v];
  }
  const storage = cfg.storage ?? {};

  function makeBuilder(
    table: string,
    mode: "select" | "update",
    patch?: Record<string, unknown>,
  ): QueryBuilderLike {
    const filters: Array<{ col: string; val: unknown }> = [];

    const resolveSelect = (): Promise<TableResponse> =>
      Promise.resolve(selects[table] ?? { data: null, error: null });

    const resolveUpdate = (): Promise<TableResponse> => {
      state.updates.push({ table, patch: patch ?? {}, filters: [...filters] });
      const seq = updatesSeq[table];
      if (seq && seq.length > 0) {
        return Promise.resolve(seq.shift() as TableResponse);
      }
      return Promise.resolve(updates[table] ?? { data: null, error: null });
    };

    const builder: QueryBuilderLike = {
      select: () => builder,
      insert: (rows) => {
        state.inserts.push({ table, row: rows });
        return builder;
      },
      update: (p) => makeBuilder(table, "update", p),
      eq: (col, val) => {
        filters.push({ col, val });
        return builder;
      },
      in: (col, vals) => {
        filters.push({ col, val: vals });
        return builder;
      },
      is: (col, val) => {
        filters.push({ col, val });
        return builder;
      },
      limit: () => builder,
      single: () => mode === "update" ? resolveUpdate() : resolveSelect(),
      maybeSingle: () => mode === "update" ? resolveUpdate() : resolveSelect(),
      then: <T>(onfulfilled: (v: TableResponse) => T) => {
        const p = mode === "update" ? resolveUpdate() : resolveSelect();
        return p.then(onfulfilled);
      },
    };
    return builder;
  }

  const rpcs = cfg.rpcs ?? {};
  state.client = {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: cfg.claims === undefined
            ? null
            : { claims: cfg.claims ?? undefined },
          error: cfg.claimsError ?? null,
        }),
    },
    from: (table: string) => makeBuilder(table, "select"),
    rpc: (fn: string) =>
      Promise.resolve(rpcs[fn] ?? { data: null, error: null }),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          state.uploads.push({ bucket, path });
          return Promise.resolve(storage[bucket] ?? { error: null });
        },
      }),
    },
  };

  return state;
}

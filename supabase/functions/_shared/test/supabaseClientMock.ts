// Lightweight Supabase client mock for Deno tests.
// Configure per-table responses, then build a SupabaseLike via buildClient().
import type { SupabaseLike, QueryBuilderLike } from "../../stamp-cfdi/handler.ts";

export interface TableResponse {
  data: unknown;
  error: unknown;
}

export interface MockUpdate {
  table: string;
  patch: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

export interface MockConfig {
  claims?: { sub?: string } | null;
  claimsError?: unknown;
  // keyed by table name: response for select-chains (single/maybeSingle/await)
  selects?: Record<string, TableResponse>;
  // keyed by table name: response for update-chains
  updates?: Record<string, TableResponse>;
  // storage upload result, keyed by bucket
  storage?: Record<string, { error: unknown }>;
}

export interface MockState {
  client: SupabaseLike;
  updates: MockUpdate[];
  uploads: Array<{ bucket: string; path: string }>;
}

export function buildSupabaseMock(cfg: MockConfig): MockState {
  const state: MockState = {
    client: undefined as unknown as SupabaseLike,
    updates: [],
    uploads: [],
  };

  const selects = cfg.selects ?? {};
  const updates = cfg.updates ?? {};
  const storage = cfg.storage ?? {};

  function makeBuilder(table: string, mode: "select" | "update", patch?: Record<string, unknown>): QueryBuilderLike {
    const filters: Array<{ col: string; val: unknown }> = [];

    const resolveSelect = async (): Promise<TableResponse> =>
      selects[table] ?? { data: null, error: null };

    const resolveUpdate = async (): Promise<TableResponse> => {
      state.updates.push({ table, patch: patch ?? {}, filters: [...filters] });
      return updates[table] ?? { data: null, error: null };
    };

    const builder: QueryBuilderLike = {
      select: () => builder,
      insert: () => builder,
      update: (p) => makeBuilder(table, "update", p),
      eq: (col, val) => { filters.push({ col, val }); return builder; },
      limit: () => builder,
      single: () => resolveSelect(),
      maybeSingle: () => resolveSelect(),
      then: <T,>(onfulfilled: (v: TableResponse) => T) => {
        const p = mode === "update" ? resolveUpdate() : resolveSelect();
        return p.then(onfulfilled);
      },
    };
    return builder;
  }

  state.client = {
    auth: {
      getClaims: async () => ({
        data: cfg.claims === undefined ? null : { claims: cfg.claims ?? undefined },
        error: cfg.claimsError ?? null,
      }),
    },
    from: (table: string) => makeBuilder(table, "select"),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          state.uploads.push({ bucket, path });
          return storage[bucket] ?? { error: null };
        },
      }),
    },
  };

  return state;
}

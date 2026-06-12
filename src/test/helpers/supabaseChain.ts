/**
 * Helper para mockear el cliente de Supabase en tests Vitest.
 *
 * Modo simple (legacy):
 *   - `fromResolver`: resolver único para CUALQUIER .from(...). Útil para tests
 *     que solo leen una tabla y no necesitan distinguir inserts/updates.
 *
 * Modo avanzado:
 *   - `tableResolvers`: map por tabla. Cada resolver recibe el historial de
 *     llamadas encadenadas (insert/update/select/eq/...) y devuelve la respuesta.
 *     Esto permite a un mismo test distinguir entre `.insert(...)` y
 *     `.select(...).eq(...)` sobre la misma tabla.
 *   - `rpcResolvers`: map por nombre de RPC. Recibe los args y devuelve la respuesta.
 *
 * Ambos modos son compatibles y pueden coexistir.
 */
import { vi } from "vitest";

export type SupabaseMockResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

export type ChainCall = { method: string; args: unknown[] };

type Resolver = () => Promise<SupabaseMockResponse> | SupabaseMockResponse;
export type ChainResolver = (
  calls: ChainCall[],
) => SupabaseMockResponse | Promise<SupabaseMockResponse>;

export function createChainable(resolver: Resolver) {
  const chain: Record<string | symbol, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === "then") {
        return (onFulfilled: (v: SupabaseMockResponse) => unknown) =>
          Promise.resolve(resolver()).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

/**
 * Chainable que registra cada llamada y la entrega al resolver al await.
 */
export function createTableChainable(resolver: ChainResolver) {
  const calls: ChainCall[] = [];
  const chain: Record<string | symbol, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === "then") {
        return (onFulfilled: (v: SupabaseMockResponse) => unknown) =>
          Promise.resolve(resolver(calls)).then(onFulfilled);
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy;
}

export function createSupabaseChainMock(opts: {
  fromResolver?: Resolver;
  rpcResolver?: Resolver;
  tableResolvers?: Record<string, ChainResolver>;
  rpcResolvers?: Record<
    string,
    (args: unknown) => SupabaseMockResponse | Promise<SupabaseMockResponse>
  >;
  storageSignedUrl?: () => Promise<{ data: { signedUrl: string } | null }>;
}) {
  const fromR = opts.fromResolver ?? (() => ({ data: [], error: null }));
  const rpcR = opts.rpcResolver ?? (() => ({ data: null, error: null }));
  const tableResolvers = opts.tableResolvers ?? {};
  const rpcResolvers = opts.rpcResolvers ?? {};
  return {
    from: vi.fn((table?: string) => {
      const t = table ?? "";
      if (tableResolvers[t]) return createTableChainable(tableResolvers[t]);
      return createChainable(fromR);
    }),
    rpc: vi.fn((name?: string, args?: unknown) => {
      const n = name ?? "";
      if (rpcResolvers[n]) return Promise.resolve(rpcResolvers[n](args));
      return Promise.resolve(rpcR());
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl:
          opts.storageSignedUrl ??
          vi.fn(async () => ({ data: { signedUrl: "https://signed/url" } })),
      })),
    },
  };
}

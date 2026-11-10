import type { CallScope } from "./officialCalls";

const scopes = new WeakMap<object, CallScope>();
export function attachConsumptionScope(client: object, scope: CallScope) {
  scopes.set(client, scope);
  return () => { scopes.delete(client); };
}
export async function consumeForClient<T>(client: object, value: unknown, reader: (value: unknown) => Promise<T>): Promise<T> {
  const scope = scopes.get(client);
  if (!scope) throw new Error("QA_CONSUMPTION_BLOCKED");
  check(scope);
  const result = await reader(value);
  check(scope);
  return result;
}
function check(scope: CallScope) { scope.checkpoint(); scope.signal.throwIfAborted(); }

/** Valida cada llamada del builder y resolución await, sin reintento.
 * Objeto local por cliente, nunca proxy HTTP ni sustitución global.
 */
export function guardOfflineEffects<T extends object>(client: T, scope: CallScope): T {
  const cache = new WeakMap<object, object>();
  const wrap = (target: object): object => {
    const existing = cache.get(target);
    if (existing) return existing;
    const view = new Proxy(target, {
      get(original, key) {
        const member = Reflect.get(original, key, original);
        // Builders PromiseLike: await llama then con sus callbacks.
        if (key === "then" && typeof member === "function") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            try {
              check(scope);
              return Promise.resolve(original).then((value) => { check(scope); return value; }).then(resolve, reject);
            } catch (error) { return Promise.reject(error).then(resolve, reject); }
          };
        }
        if (typeof member === "function") return (...args: unknown[]) => {
          check(scope);
          const result: unknown = Reflect.apply(member, original, args);
          if (result instanceof Promise) return result.then((value: unknown) => { check(scope); return value; });
          if (result && typeof result === "object") return wrap(result);
          check(scope);
          return result;
        };
        if (member && typeof member === "object") return wrap(member);
        return member;
      },
    });
    cache.set(target, view);
    return view;
  };
  return wrap(client) as T;
}

/** Fetch inyectado existente de download-cfdi; nunca fetch global/POST alternativo. */
export function guardOfflineFetch(fetchImpl: typeof fetch, scope: CallScope): typeof fetch {
  return async (input, init = {}) => {
    check(scope);
    if (init.signal != null && !(init.signal instanceof AbortSignal)) throw new Error("QA_SIGNAL_INCOMPATIBLE");
    const requestSignal = input instanceof Request ? input.signal : undefined;
    const signals = [scope.signal, ...(requestSignal ? [requestSignal] : []), ...(init.signal ? [init.signal] : [])];
    const signal = signals.length > 1 ? AbortSignal.any(signals) : scope.signal;
    signal.throwIfAborted();
    const response = await fetchImpl(input, { ...init, signal });
    check(scope); signal.throwIfAborted();
    return new Proxy(response, {
      get(target, key) {
        if (key === "body" || key === "clone") throw new Error("QA_STREAM_OR_CLONE_UNREVIEWED");
        const value = Reflect.get(target, key, target);
        if (["arrayBuffer", "text", "blob", "json", "formData"].includes(String(key)) && typeof value === "function") {
          return async () => {
            check(scope); signal.throwIfAborted();
            const body = await Reflect.apply(value, target, []);
            check(scope); signal.throwIfAborted();
            return body;
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
}
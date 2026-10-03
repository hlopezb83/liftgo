// Evidencia del runtime real de Cloud, sin invocar el negocio ni leer el entorno.
// El mínimo de versión no acredita por sí solo la compatibilidad del SDK completo.
type ContextStore = {
  run<T>(value: string, callback: () => T): T;
  getStore(): string | undefined;
  disable(): void;
};
type ContextModule = { AsyncLocalStorage: new () => ContextStore };
type RuntimeVersion = { deno: string; v8: string; typescript: string };

export async function inspectEdgeRuntime(
  version: RuntimeVersion = Deno.version,
  loadContext: () => Promise<ContextModule> = () => import("node:async_hooks"),
) {
  let asyncLocalStorage = false;
  try {
    const { AsyncLocalStorage } = await loadContext();
    const context = new AsyncLocalStorage();
    try {
      const values = await Promise.all(
        ["probe-a", "probe-b"].map((value) =>
          context.run(value, async () => {
            await Promise.resolve();
            return context.getStore();
          })
        ),
      );
      asyncLocalStorage = values[0] === "probe-a" &&
        values[1] === "probe-b" && context.getStore() === undefined;
    } finally {
      context.disable();
    }
  } catch {
    // No copiar al log el error de importación o datos del host.
  }
  // Cloud declara su versión compatible dentro de la etiqueta del Edge Runtime.
  const compatible =
    /^supabase-edge-runtime-\d+\.\d+\.\d+ \(compatible with Deno v(\d+\.\d+\.\d+)\)$/
      .exec(version.deno)?.[1];
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(compatible ?? version.deno);
  const [major, minor, patch] = match ? match.slice(1).map(Number) : [0, 0, 0];
  const minimumVersion = major > 2 ||
    (major === 2 && (minor > 8 || (minor === 8 && patch >= 3)));
  return {
    deno: version.deno,
    v8: version.v8,
    typescript: version.typescript,
    asyncLocalStorage,
    sentry11RuntimeMinimumMet: minimumVersion && asyncLocalStorage,
  };
}

let reported = false;

/** Una línea técnica por arranque; el handler no espera ni depende del diagnóstico. */
export function reportEdgeRuntime(functionName: "parse-csf"): void {
  if (reported) return;
  reported = true;
  void inspectEdgeRuntime().then((runtime) => {
    console.info(JSON.stringify({
      event: "liftgo.edge.runtime",
      function: functionName,
      ...runtime,
    }));
  }).catch(() => {
    // Un fallo del diagnóstico nunca cambia la operación de la función.
  });
}

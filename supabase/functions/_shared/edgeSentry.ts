import { AsyncLocalStorage } from "node:async_hooks";
import * as Sentry from "@sentry/deno";
import { runObservedWork } from "./edgeSentryWork.ts";
import { scrubEdgeEvent, verifiedId } from "./edgeSentryPrivacy.ts";
import { edgeException, expectedEdgeFailure } from "./edgeSentryError.ts";

type Identity = { userId?: string; organizationId?: string; role?: string };
type RequestState = {
  functionName: string;
  reported: boolean;
  suppressed: boolean;
  identity: Identity;
  seen: WeakSet<object>;
  failedJobs: Set<unknown>;
  delivery: { reported: boolean; unobservedJob: boolean };
};
type Client = ReturnType<typeof Sentry.init>;
type Options = {
  options: () => Sentry.DenoOptions | undefined;
  initialize?: typeof Sentry.init;
  isolate?: <T>(work: (scope: Sentry.Scope) => T) => T;
  captureException?: typeof Sentry.captureException;
  waitUntil?: (promise: Promise<unknown>) => void;
  reportInitialization?: (active: boolean) => void;
};
const FLUSH_BUDGET_MS = 500;
const PUBLIC_DSN =
  "https://e8df6c29317f5f884be32f4b0c50ac05@o4511415732404224.ingest.us.sentry.io/4511770994933760";

export function edgeSentryOptions(): Sentry.DenoOptions | undefined {
  if (Deno.env.get("SENTRY_ENABLED") === "0") return undefined;
  const cloud = Deno.version.deno.startsWith("supabase-edge-runtime-");
  const dsn = Deno.env.get("SENTRY_DSN") ?? (cloud ? PUBLIC_DSN : undefined);
  if (!dsn) return undefined;
  return {
    dsn,
    release: Deno.env.get("SENTRY_RELEASE") ?? "liftgo-cloud@2026-10-03",
    environment: "production",
  };
}

async function settleWithinBudget(
  work: () => PromiseLike<unknown>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work).catch(() => undefined),
      new Promise<void>((done) => {
        timer = setTimeout(done, FLUSH_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** SDK 10.x instala ALS mediante la integración pública DenoServe, sin APIs internas. */
export function createEdgeObserver(config: Options) {
  const state = new AsyncLocalStorage<RequestState>();
  let attempted = false;
  let client: Client | undefined;
  function initialize() {
    if (attempted) return client;
    attempted = true;
    try {
      const options = config.options();
      if (options) {
        client = (config.initialize ?? Sentry.init)({
          ...options,
          serverName: "liftgo-cloud",
          defaultIntegrations: [Sentry.denoServeIntegration()],
          skipOpenTelemetrySetup: true,
          sendDefaultPii: false,
          maxBreadcrumbs: 0,
          tracesSampleRate: 0,
          tracePropagationTargets: [],
          enableLogs: false,
          enableMetrics: false,
          beforeSendLog: () => null,
          beforeSendMetric: () => null,
          beforeSend: scrubEdgeEvent,
        });
      }
    } catch { /* El monitoreo no altera el negocio. */ }
    try {
      config.reportInitialization?.(!!client);
    } catch { /* Log opcional. */ }
    return client;
  }
  function setIdentity(identity: Identity) {
    const current = state.getStore();
    if (!client || !current || current.suppressed) return;
    current.identity = { ...identity };
    try {
      const scope = Sentry.getIsolationScope();
      scope.setUser(
        verifiedId(identity.userId) && identity.role !== "service_role"
          ? { id: identity.userId }
          : null,
      );
      scope.setTag(
        "organization_id",
        verifiedId(identity.organizationId)
          ? identity.organizationId
          : undefined,
      );
      scope.setTag("role", identity.role);
    } catch { /* Identidad de diagnóstico, no autorización del negocio. */ }
  }
  function capture(error: unknown, status?: number) {
    const current = state.getStore();
    if (
      !client || !current || current.suppressed || current.reported ||
      current.failedJobs.has(error)
    ) return;
    try {
      if (expectedEdgeFailure(error, status)) return;
      if (error && typeof error === "object") {
        if (current.seen.has(error)) return;
      }
      // El SDK marca objetos capturados. Una copia evita suprimir el mismo Error
      // reutilizado por otra solicitud; el stack original conserva el punto del fallo.
      (config.captureException ?? Sentry.captureException)(
        edgeException(error),
        {
          captureContext: {
            tags: status ? { http_status: String(status) } : undefined,
          },
          mechanism: { type: "liftgo.edge", handled: true },
        },
      );
      if (error && typeof error === "object") current.seen.add(error);
      current.reported = true;
      current.delivery.reported = true;
    } catch { /* No serializar el error de telemetría. */ }
  }
  async function flush() {
    if (!client || !state.getStore()?.delivery.reported) return;
    const pending = settleWithinBudget(() => client!.flush(250)).catch(() =>
      undefined
    );
    try {
      if (config.waitUntil) {
        config.waitUntil(pending);
        return;
      }
    } catch { /* Si el host rechaza waitUntil, usar la alternativa acotada. */ }
    await pending;
  }
  function enter<T>(requestState: RequestState, work: () => T): T {
    return state.run(
      requestState,
      () =>
        (config.isolate ?? Sentry.withIsolationScope)((scope) => {
          scope.clear();
          Sentry.getCurrentScope().setClient(client);
          scope.setTags({
            app: "liftgo-erp",
            runtime: "deno",
            edge_function: requestState.functionName,
            workspace: "organization",
          });
          setIdentity(requestState.identity);
          return work();
        }),
    );
  }
  function wrap(
    functionName: string,
    handler: (request: Request) => Response | Promise<Response>,
  ) {
    return async (request: Request): Promise<Response> => {
      if (!initialize()) return handler(request);
      const requestState: RequestState = {
        functionName,
        reported: false,
        suppressed: false,
        identity: {},
        seen: new WeakSet(),
        failedJobs: new Set(),
        delivery: { reported: false, unobservedJob: false },
      };
      return await runObservedWork(
        (work) => enter(requestState, work),
        async () => {
          try {
            const response = await handler(request);
            if (
              response.status >= 500 && !requestState.delivery.reported &&
              !requestState.delivery.unobservedJob
            ) {
              capture(new Error("Cloud response failed"), response.status);
            }
            return response;
          } catch (error) {
            capture(error);
            throw error;
          } finally {
            await flush();
          }
        },
        () => handler(request),
      );
    };
  }
  async function withJob<T>(
    identity: Identity,
    work: () => T | Promise<T>,
  ): Promise<T> {
    const current = state.getStore();
    if (!client || !current || current.suppressed) return work();
    const jobState: RequestState = {
      ...current,
      reported: false,
      seen: new WeakSet(),
      failedJobs: new Set(),
      identity: { ...current.identity, ...identity },
    };
    try {
      return await runObservedWork(
        (task) => enter(jobState, task),
        async () => {
          try {
            return await work();
          } catch (error) {
            capture(error);
            throw error;
          } finally {
            if (jobState.reported) await flush();
          }
        },
        // Failed job context must not capture under the parent's organization.
        () => {
          current.delivery.unobservedJob = true;
          return state.run({ ...jobState, suppressed: true }, work);
        },
      );
    } catch (error) {
      // A propagated child failure must never be recaptured as the parent's company.
      current.failedJobs.add(error);
      if (!jobState.reported) current.delivery.unobservedJob = true;
      throw error;
    }
  }
  async function close() {
    state.disable();
    if (client) await settleWithinBudget(() => client!.close(250));
  }
  return { wrap, capture, setIdentity, withJob, close };
}

const observer = createEdgeObserver({
  options: edgeSentryOptions,
  waitUntil: (pending) => {
    const runtime = (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
    }).EdgeRuntime;
    if (!runtime) throw new Error("No waitUntil");
    runtime.waitUntil(pending);
  },
  reportInitialization: (active) =>
    console.info(
      JSON.stringify({
        event: "liftgo.edge.sentry",
        sdk: Sentry.SDK_VERSION,
        active,
      }),
    ),
});
export const wrapEdgeFunction = observer.wrap;
/** Identidad ya verificada en auth/BD; nunca derivarla de headers, PDF o payload. */
export const setVerifiedEdgeIdentity = observer.setIdentity;
export const captureEdgeError = observer.capture;
export const withVerifiedEdgeJob = observer.withJob;

import { captureException, getClient, getIsolationScope, setAsyncLocalStorageAsyncContextStrategy, type CloudflareOptions } from "@sentry/cloudflare";
import { wrapRequestHandler } from "@sentry/cloudflare/request";
import { createPrivacyOptions, PUBLIC_SENTRY_DSN, scrubServerEvent } from "./privacyOptions";

type RequestContext = { waitUntil(promise: Promise<unknown>): void; passThroughOnException?(): void };
type RuntimeRequest = Request & { runtime?: { cloudflare?: { context?: RequestContext; env?: unknown } }; waitUntil?: RequestContext["waitUntil"] };
const reported = new WeakMap<object, WeakSet<object>>();
const FALLBACK_FLUSH_BUDGET_MS = 750;
let contextStrategyInstalled = false;

export function createServerSentryOptions(env: unknown): CloudflareOptions | undefined {
  if (!import.meta.env.PROD && import.meta.env.VITE_SENTRY_FORCE !== "1") return undefined;
  const bindings = env && typeof env === "object" ? env as Record<string, unknown> : {};
  const dsn = typeof bindings.SENTRY_DSN === "string" ? bindings.SENTRY_DSN
    : process.env.SENTRY_DSN ?? import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_SENTRY_DSN;
  if (!dsn) return undefined;
  return {
    ...createPrivacyOptions(), dsn, environment: import.meta.env.MODE,
    release: `liftgo@${import.meta.env.VITE_APP_VERSION ?? "unknown"}`,
    // Captura de fallos primero. Trazas del servidor requieren medir cuota y latencia.
    tracesSampleRate: 0,
    integrations: (integrations) => integrations.filter(({ name }) => name !== "Console"),
    beforeSend: scrubServerEvent,
    initialScope: { tags: { app: "liftgo-erp", runtime: "server" } },
  };
}

function getContext(request: RuntimeRequest, ctx: unknown): RequestContext | undefined {
  if (ctx && typeof ctx === "object" && "waitUntil" in ctx && typeof ctx.waitUntil === "function") return ctx as RequestContext;
  const runtime = request.runtime?.cloudflare?.context;
  if (runtime && typeof runtime.waitUntil === "function") return runtime;
  if (typeof request.waitUntil === "function") return { waitUntil: request.waitUntil.bind(request) };
  return undefined;
}

/** Lovable usa Nitro: el contexto de Cloudflare viene también en el Request. */
export async function withServerSentry(
  request: Request, env: unknown, ctx: unknown, handler: () => Promise<Response> | Response,
  options = createServerSentryOptions(env ?? (request as RuntimeRequest).runtime?.cloudflare?.env),
): Promise<Response> {
  if (!options) return handler();
  const nativeContext = getContext(request, ctx);
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil(promise: Promise<unknown>) {
      const safe = promise.catch(() => undefined);
      if (nativeContext) nativeContext.waitUntil(safe);
      else pending.push(safe);
    },
    passThroughOnException() { nativeContext?.passThroughOnException?.(); },
  };
  let started = false;
  let response: Response | undefined;
  let flushDeadline: number | undefined;
  try {
    if (!contextStrategyInstalled) {
      setAsyncLocalStorageAsyncContextStrategy();
      contextStrategyInstalled = true;
    }
    return await wrapRequestHandler({ options, request, context }, async () => {
      started = true;
      response = await handler();
      // El runtime fetch-only no puede prolongar la invocación. Enviar los errores
      // ya capturados antes de devolver el stream, sin esperar a que termine.
      if (!nativeContext) {
        flushDeadline = Date.now() + FALLBACK_FLUSH_BUDGET_MS;
        const client = getClient();
        if (client) await settleWithinBudget([Promise.resolve(client.flush(200))]);
      }
      return response;
    });
  } catch (error) {
    // Un fallo del monitoreo no debe repetir una mutación ni romper una respuesta lista.
    if (response) return response;
    if (!started) return handler();
    throw error;
  } finally {
    if (!nativeContext && pending.length) {
      await settleWithinBudget(pending, Math.max(0, (flushDeadline ?? Date.now() + FALLBACK_FLUSH_BUDGET_MS) - Date.now()));
    }
  }
}

async function settleWithinBudget(pending: Promise<unknown>[], budget = FALLBACK_FLUSH_BUDGET_MS): Promise<void> {
  if (budget <= 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.allSettled(pending), new Promise<void>((done) => {
      timer = setTimeout(done, budget);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** El caller ya pasó el guard. Nunca derivar identidad de headers o del input. */
export function setVerifiedServerIdentity(identity: { userId: string; organizationId?: string; role?: string; workspace: "organization" | "platform" }): void {
  try {
    if (!getClient()) return;
    const scope = getIsolationScope();
    scope.setUser({ id: identity.userId });
    scope.setTag("workspace", identity.workspace);
    if (identity.workspace === "platform") {
      scope.setTag("organization_id", undefined);
      scope.setTag("role", "platform_operator");
    } else {
      if (identity.organizationId) scope.setTag("organization_id", identity.organizationId);
      if (identity.role) scope.setTag("role", identity.role);
    }
  } catch { /* El diagnóstico no cambia el resultado de los permisos. */ }
}

/** El error completo sólo cruza el filtro del SDK; nunca copiar datos del formulario. */
export function captureServerError(error: unknown): void {
  try {
    if (!getClient() || isExpectedFailure(error)) return;
    const scope = getIsolationScope();
    if (error && typeof error === "object") {
      let seen = reported.get(scope);
      if (!seen) { seen = new WeakSet(); reported.set(scope, seen); }
      if (seen.has(error)) return;
      seen.add(error);
    }
    captureException(error, { mechanism: { handled: true, type: "liftgo.server" } });
  } catch { /* Conservar el resultado y el error original del negocio. */ }
}

function isExpectedFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = Object.getOwnPropertyDescriptor(error, "status")?.value
    ?? Object.getOwnPropertyDescriptor(error, "statusCode")?.value;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500) return true;
  const message = Object.getOwnPropertyDescriptor(error, "message")?.value;
  return typeof message === "string" && /^(?:Unauthorized|Forbidden):/.test(message);
}

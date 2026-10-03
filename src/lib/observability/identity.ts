import { deriveFlow, sanitizeRoute } from "./routeContext";
import { redactPII } from "./scrubPII";
import { Sentry } from "./sentry";

interface Identity {
  userId: string | null;
  organizationId: string | null;
  role: string | null;
  workspace: "organization" | "platform" | "portal";
}

let previous: string | null = null;
let replayGeneration = 0;

/** Sólo UUIDs de identidad verificada; nunca nombres, RFC, correo ni claves. */
export function syncSentryIdentity(identity: Identity): void {
  if (typeof window === "undefined") return;
  const signature = JSON.stringify(identity);
  if (signature !== previous) {
    previous = signature;
    const generation = ++replayGeneration;
    // El buffer anterior no debe enviarse con la identidad nueva.
    const replay = Sentry.getReplay();
    if (replay) void replay.stop({ flush: false }).then(() => {
      if (generation === replayGeneration && identity.userId) replay.startBuffering();
    }).catch(() => { /* el monitoreo nunca bloquea el cambio de empresa/sesión */ });
    for (const scope of [Sentry.getCurrentScope(), Sentry.getIsolationScope()]) {
      scope.clearBreadcrumbs();
      scope.setContext("route", null);
    }
  }
  Sentry.setUser(identity.userId ? { id: identity.userId } : null);
  Sentry.setTag("tenant", identity.organizationId ?? undefined);
  Sentry.setTag("organization_id", identity.organizationId ?? undefined);
  Sentry.setTag("role", identity.role ?? undefined);
  Sentry.setTag("workspace", identity.workspace);
  const route = redactPII(sanitizeRoute(window.location.pathname));
  const flow = redactPII(deriveFlow(window.location.pathname));
  Sentry.setTag("route", route);
  Sentry.setTag("flow", flow);
  Sentry.setContext("route", { route, flow });
  // En Sentry 11 los tags no se añaden a spans: usar atributos explícitos.
  Sentry.setAttributes({
    organization_id: identity.organizationId ?? undefined,
    role: identity.role ?? undefined,
    workspace: identity.workspace,
    route, flow,
  });
}

export function clearSentryIdentity(): void {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const workspace = path.startsWith("/platform") ? "platform" : path.startsWith("/portal") ? "portal" : "organization";
  syncSentryIdentity({ userId: null, organizationId: null, role: null, workspace });
}

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
let identityRevision = 0;
let activeUserId: string | null = null;

/** Sólo UUIDs de identidad verificada; nunca nombres, RFC, correo ni claves. */
export function syncSentryIdentity(identity: Identity): number {
  if (typeof window === "undefined") return 0;
  const revision = ++identityRevision;
  activeUserId = identity.userId;
  const signature = JSON.stringify(identity);
  if (signature !== previous) {
    previous = signature;
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
  return revision;
}

/** Una limpieza tardía sólo puede retirar el contexto que ella misma instaló. */
export function clearSentryIdentity(expectedRevision?: number): boolean {
  if (expectedRevision !== undefined && expectedRevision !== identityRevision) return false;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const workspace = path.startsWith("/platform") ? "platform" : path.startsWith("/portal") ? "portal" : "organization";
  syncSentryIdentity({ userId: null, organizationId: null, role: null, workspace });
  return true;
}

/** La purga de una sesión antigua nunca borra la identidad nueva ya verificada. */
export function clearSentryIdentityForUser(userId: string | null): boolean {
  return activeUserId === userId && clearSentryIdentity();
}

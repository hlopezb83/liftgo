import type { ErrorEvent, StackFrame } from "@sentry/deno";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_TYPES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "DOMException",
  "AiGatewayError",
]);
export const verifiedId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

function safeFrame(frame: StackFrame): StackFrame {
  let filename: string | undefined;
  if (typeof frame.filename === "string") {
    const path = frame.filename.split(/[?#]/, 1)[0];
    const name = path.split(/[\\/]/).pop();
    if (name && /^[a-zA-Z0-9_.-]{1,100}\.(?:ts|js|mjs|cjs)$/.test(name)) {
      filename = `app:///edge/${name}`;
    }
  }
  return {
    filename,
    lineno: Number.isSafeInteger(frame.lineno) && frame.lineno! > 0
      ? frame.lineno
      : undefined,
    colno: Number.isSafeInteger(frame.colno) && frame.colno! >= 0
      ? frame.colno
      : undefined,
    in_app: typeof frame.in_app === "boolean" ? frame.in_app : undefined,
  };
}

/** Lista permitida: ningún cuerpo, mensaje del proveedor, CSF, prompt o extra. */
export function scrubEdgeEvent(event: ErrorEvent): ErrorEvent {
  const tags: Record<string, string> = { app: "liftgo-erp", runtime: "deno" };
  for (const key of ["edge_function", "role", "workspace"]) {
    const value = event.tags?.[key];
    if (typeof value === "string" && /^[a-z_-]{1,64}$/.test(value)) {
      tags[key] = value;
    }
  }
  if (verifiedId(event.tags?.organization_id)) {
    tags.organization_id = event.tags.organization_id;
  }
  const status = Number(event.tags?.http_status);
  if (Number.isInteger(status) && status >= 500 && status <= 599) {
    tags.http_status = String(status);
  }
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: "javascript",
    level: event.level,
    environment: event.environment,
    release: event.release,
    sdk: event.sdk,
    tags,
    // Mantener el agrupamiento por stack, distinguiendo las funciones que
    // comparten wrapper/handler.ts; no fragmentar incidentes por empresa o actor.
    fingerprint: tags.edge_function
      ? ["{{ default }}", tags.edge_function]
      : undefined,
    user: verifiedId(event.user?.id) ? { id: event.user.id } : undefined,
    exception: {
      values: event.exception?.values?.slice(0, 5).map((value) => ({
        type: ERROR_TYPES.has(value.type ?? "") ? value.type : "Error",
        value: "Fallo técnico en LiftGo Cloud",
        stacktrace: value.stacktrace
          ? { frames: value.stacktrace.frames?.slice(-50).map(safeFrame) }
          : undefined,
        mechanism: { type: "liftgo.edge", handled: true },
      })),
    },
  };
}

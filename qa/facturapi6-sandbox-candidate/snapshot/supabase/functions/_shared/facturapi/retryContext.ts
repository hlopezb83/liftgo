import { isUUID } from "../validate.ts";
import type { OrgQueryClient } from "../orgContext.ts";
import {
  type FacturapiMode,
  getFacturapiConfigForOrganization,
  isFacturapiConfigError,
} from "./client.ts";

export class FiscalRetryContextError extends Error {
  constructor(readonly kind: "changed" | "unavailable" | "forbidden") {
    super(
      kind === "unavailable"
        ? "No se pudo verificar la configuración original del reintento."
        : "El reintento perdió su reserva o su configuración fiscal original.",
    );
    this.name = "FiscalRetryContextError";
  }
  get status() {
    return this.kind === "unavailable"
      ? 503
      : this.kind === "forbidden"
      ? 403
      : 412;
  }
  get code() {
    return this.kind === "unavailable"
      ? "FISCAL_RETRY_UNAVAILABLE"
      : "FISCAL_RETRY_CHANGED";
  }
}
export async function fiscalConfigFingerprint(
  mode: FacturapiMode,
  apiKey: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${mode}:${apiKey}`),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
type RetryConfigInput =
  & Parameters<typeof getFacturapiConfigForOrganization>[0]
  & {
    body: unknown;
    isServiceRole: boolean;
    documentId: string;
    operation: string;
  };
/** Sólo la llamada interna presenta una reserva; el secreto nunca viaja en el payload. */
export async function assertFiscalRetryContext(
  input:
    & Pick<
      RetryConfigInput,
      "body" | "isServiceRole" | "documentId" | "operation" | "organizationId"
    >
    & { admin: OrgQueryClient },
  config: { apiKey: string | null; mode: FacturapiMode },
): Promise<void> {
  const body = input.body as
    | { retry_queue?: { id?: unknown; token?: unknown } }
    | null;
  if (!body || !Object.hasOwn(body, "retry_queue")) return;
  if (!input.isServiceRole) throw new FiscalRetryContextError("forbidden");
  const context = body.retry_queue;
  if (
    !context || !isUUID(context.id) || typeof context.token !== "string" ||
    !Number.isFinite(Date.parse(context.token))
  ) {
    throw new FiscalRetryContextError("changed");
  }
  try {
    const queue = await input.admin.from("cfdi_retry_queue").select("id")
      .eq("id", context.id).eq("organization_id", input.organizationId)
      .eq("invoice_id", input.documentId).eq("operation", input.operation)
      .eq("status", "processing").eq("updated_at", context.token).maybeSingle();
    if (queue.error) throw new FiscalRetryContextError("unavailable");
    if (!queue.data) throw new FiscalRetryContextError("changed");
    const metadata = await input.admin.from("platform_fiscal_jobs")
      .select(
        "organization_id, document_id, operation, mode_at_enqueue, key_fingerprint, config_source, removed",
      )
      .eq("id", context.id).maybeSingle();
    if (metadata.error) throw new FiscalRetryContextError("unavailable");
    const job = metadata.data;
    if (
      !job || job.removed || job.config_source !== "attempt" ||
      job.organization_id !== input.organizationId ||
      job.document_id !== input.documentId ||
      job.operation !== input.operation ||
      job.mode_at_enqueue !== config.mode || !config.apiKey ||
      job.key_fingerprint !==
        await fiscalConfigFingerprint(config.mode, config.apiKey)
    ) {
      throw new FiscalRetryContextError("changed");
    }
  } catch (error) {
    if (error instanceof FiscalRetryContextError) throw error;
    throw new FiscalRetryContextError("unavailable");
  }
}
export async function getRetryAwareFacturapiConfig(input: RetryConfigInput) {
  // El rechazo del contexto del navegador precede a toda lectura de secretos.
  if (
    !input.isServiceRole && input.body &&
    Object.hasOwn(input.body, "retry_queue")
  ) {
    throw new FiscalRetryContextError("forbidden");
  }
  const config = await getFacturapiConfigForOrganization(input);
  await assertFiscalRetryContext(input, config);
  return config;
}
export async function loadRetryAwareFacturapiConfig(input: RetryConfigInput) {
  try {
    return { ok: true as const, ...await getRetryAwareFacturapiConfig(input) };
  } catch (error) {
    if (error instanceof FiscalRetryContextError) {
      return {
        ok: false as const,
        status: error.status,
        message: error.message,
        code: error.code,
      };
    }
    if (isFacturapiConfigError(error)) {
      return {
        ok: false as const,
        status: error.code === "config_read_error" ? 503 : 400,
        message: error.message,
        code: error.code,
      };
    }
    throw error;
  }
}

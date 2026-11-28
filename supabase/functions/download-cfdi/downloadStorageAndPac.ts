import { getCorsHeaders } from "../_shared/cors.ts";
import {
  FacturapiConfigError,
  getFacturapiConfigForOrganization,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";
import {
  FacturapiTimeoutError,
  fetchWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";
import { jsonError } from "../_shared/http.ts";
import type {
  BaseFormat,
  DownloadCfdiDeps,
  DownloadSupabaseLike,
} from "./downloadAuthAndAccess.ts";

const BUCKET = "cfdi-files";
const FACTURAPI_BASE = "https://www.facturapi.io/v2";

export type FacturapiFetch =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; detail: string };

export type KeyResult =
  | { ok: true; apiKey: string }
  | { ok: false; response: Response };

async function fetchFacturapiBinary(
  apiKey: string,
  path: string,
  fetchImpl: typeof fetch,
): Promise<FacturapiFetch> {
  try {
    const bytes = await retryOnFacturapi5xx(async () => {
      const r = await fetchWithTimeout(
        `${FACTURAPI_BASE}${path}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
        undefined,
        fetchImpl,
      );
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        const err = new Error(`Facturapi ${r.status}`) as Error & {
          status?: number;
          detail?: string;
        };
        err.status = r.status;
        err.detail = text;
        throw err;
      }
      return new Uint8Array(await r.arrayBuffer());
    });
    return { ok: true, bytes };
  } catch (err) {
    if (err instanceof FacturapiTimeoutError) {
      console.error("[download-cfdi] Facturapi timeout", {
        path,
        timeoutMs: err.timeoutMs,
      });
      return { ok: false, status: 504, detail: err.message };
    }
    const e = err as { status?: number; detail?: string; message?: string };
    console.error("[download-cfdi] Facturapi failed", {
      path,
      status: e.status ?? 500,
    });
    return {
      ok: false,
      status: e.status ?? 500,
      detail: e.detail ?? e.message ?? "unknown",
    };
  }
}

export function fetchFromFacturapi(
  apiKey: string,
  facturapiId: string,
  format: BaseFormat,
  fetchImpl: typeof fetch,
): Promise<FacturapiFetch> {
  return fetchFacturapiBinary(
    apiKey,
    `/invoices/${facturapiId}/${format}`,
    fetchImpl,
  );
}

export function fetchAcuseFromFacturapi(
  apiKey: string,
  facturapiId: string,
  format: BaseFormat,
  fetchImpl: typeof fetch,
): Promise<FacturapiFetch> {
  return fetchFacturapiBinary(
    apiKey,
    `/invoices/${facturapiId}/cancellation_receipt/${format}`,
    fetchImpl,
  );
}

export async function loadFacturapiKey(
  req: Request,
  supabase: DownloadSupabaseLike,
  deps: DownloadCfdiDeps,
  organizationId: string,
): Promise<KeyResult> {
  try {
    const { apiKey } = await getFacturapiConfigForOrganization({
      admin: supabase,
      env: deps.env,
      organizationId,
    });
    if (!apiKey) {
      return {
        ok: false,
        response: jsonError(req, 500, "Facturapi key not configured"),
      };
    }
    return { ok: true, apiKey };
  } catch (err) {
    if (err instanceof FacturapiConfigError) {
      console.error("[download-cfdi] configuración fiscal no resoluble", {
        organization_id: organizationId,
        code: err.code,
      });
      const status = err.code === "config_read_error" ? 503 : 500;
      return { ok: false, response: jsonError(req, status, err.message) };
    }
    throw err;
  }
}

export function attachmentResponse(
  req: Request,
  body: BodyInit | Uint8Array,
  contentType: string,
  filename: string,
): Response {
  const headers = new Headers(getCorsHeaders(req));
  headers.set("Content-Type", contentType);
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
  return new Response(body as BodyInit, { headers });
}

export async function tryStorageDownload(
  supabase: DownloadSupabaseLike,
  path: string | null,
): Promise<Blob | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path);
  return data ?? null;
}

export async function persistDownload(params: {
  supabase: DownloadSupabaseLike;
  newPath: string;
  bytes: Uint8Array;
  contentType: string;
  table: "invoices" | "payments" | "credit_notes";
  updates: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
}): Promise<boolean> {
  const {
    supabase,
    newPath,
    bytes,
    contentType,
    table,
    updates,
    matchColumn,
    matchValue,
  } = params;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, bytes, { contentType, upsert: true });
  if (upErr) {
    console.error("Storage upload failed:", upErr);
    return false;
  }
  const { error: updErr } = await supabase
    .from(table)
    .update(updates)
    .eq(matchColumn, matchValue);
  if (updErr) {
    console.error(
      "download-cfdi: update de metadatos falló tras el upload:",
      updErr,
    );
    return false;
  }
  return true;
}

export async function clearXmlPendingFlag(
  supabase: DownloadSupabaseLike,
  invoiceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("invoices")
    .update({ cfdi_xml_pending: false })
    .eq("id", invoiceId);
  if (error) {
    console.error("download-cfdi: no se pudo limpiar cfdi_xml_pending:", error);
  }
}

export function facturapiErrorResponse(
  req: Request,
  res: Extract<FacturapiFetch, { ok: false }>,
  notFoundMsg?: string,
): Response {
  const msg = res.status >= 500
    ? "Facturapi está experimentando problemas. Intenta de nuevo en unos segundos."
    : res.status === 404 && notFoundMsg
    ? notFoundMsg
    : `Facturapi error: ${res.status}`;
  console.error(
    "download-cfdi: facturapi error detail:",
    res.detail.slice(0, 500),
  );
  return jsonError(req, 502, msg);
}

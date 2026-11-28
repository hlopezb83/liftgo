// Pure handler for download-cfdi, deps-injected for testability.
// SIN cambio de comportamiento observable respecto al Deno.serve original.
import { handleCors } from "../_shared/cors.ts";
import {
  createRequestDiagnostics,
  type EdgeDiagnostics,
} from "../_shared/edgeDiagnostics.ts";
import { jsonError } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  downloadCreditNoteBranch,
  downloadInvoiceOrAcuseBranch,
  downloadRepBranch,
} from "./documentBranches.ts";
import {
  authenticateDownload,
  type BaseFormat,
  type DlFormat,
  type DownloadCfdiDeps as BaseDownloadCfdiDeps,
  type DownloadSupabaseLike,
  enforceRateLimitWithDeps,
  resolvePortalForRole,
} from "./downloadAuthAndAccess.ts";

export type DownloadCfdiDeps = BaseDownloadCfdiDeps & {
  diagnostics?: EdgeDiagnostics;
};
export type { DownloadSupabaseLike };

const VALID_FORMATS = new Set<string>(["xml", "pdf", "acuse_xml", "acuse_pdf"]);

interface ParsedDownloadBody {
  invoiceId: unknown;
  paymentId: unknown;
  creditNoteId: unknown;
  isAcuse: boolean;
  baseFormat: BaseFormat;
  contentType: string;
}

const FORMAT_META: Record<
  DlFormat,
  { isAcuse: boolean; baseFormat: BaseFormat; contentType: string }
> = {
  xml: {
    isAcuse: false,
    baseFormat: "xml",
    contentType: "application/xml",
  },
  pdf: {
    isAcuse: false,
    baseFormat: "pdf",
    contentType: "application/pdf",
  },
  acuse_xml: {
    isAcuse: true,
    baseFormat: "xml",
    contentType: "application/xml",
  },
  acuse_pdf: {
    isAcuse: true,
    baseFormat: "pdf",
    contentType: "application/pdf",
  },
};

function hasAnyTargetUuid(
  invoiceId: unknown,
  paymentId: unknown,
  creditNoteId: unknown,
): boolean {
  return [invoiceId, paymentId, creditNoteId].some(isUUID);
}

function parseDownloadBody(
  req: Request,
  body: Record<string, unknown> | null,
): { ok: true; data: ParsedDownloadBody } | { ok: false; response: Response } {
  const invoiceId = body?.invoice_id;
  const paymentId = body?.payment_id;
  const creditNoteId = body?.credit_note_id;
  const format = typeof body?.format === "string" ? body.format : "";
  if (
    !VALID_FORMATS.has(format) ||
    !hasAnyTargetUuid(invoiceId, paymentId, creditNoteId)
  ) {
    return { ok: false, response: jsonError(req, 400, "Invalid payload") };
  }

  const meta = FORMAT_META[format as DlFormat];
  if (meta.isAcuse && !isUUID(invoiceId)) {
    return {
      ok: false,
      response: jsonError(req, 400, "Acuse download requires invoice_id"),
    };
  }

  return {
    ok: true,
    data: {
      invoiceId,
      paymentId,
      creditNoteId,
      ...meta,
    },
  };
}

export async function handleDownloadCfdi(
  req: Request,
  deps: DownloadCfdiDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const diag = createRequestDiagnostics(deps.diagnostics);

  try {
    const auth = await authenticateDownload(req, deps);
    if (!auth.ok) return auth.response;
    diag.authenticated({ userId: auth.userId, role: auth.role });
    const supabase = auth.supabase;

    const limited = await enforceRateLimitWithDeps(
      req,
      supabase,
      "download-cfdi",
      auth.userId,
      30,
      60,
    );
    if (limited) return limited;

    const portalRes = await resolvePortalForRole(
      req,
      supabase,
      auth.role,
      auth.userId,
    );
    if (!portalRes.ok) return portalRes.response;

    const rawBody = await req.json().catch(() => null);
    const parsed = parseDownloadBody(req, rawBody);
    if (!parsed.ok) return parsed.response;

    const {
      invoiceId,
      paymentId,
      creditNoteId,
      isAcuse,
      baseFormat,
      contentType,
    } = parsed.data;
    const ctx = {
      req,
      supabase,
      deps,
      userId: auth.userId,
      portal: portalRes.portal,
      baseFormat,
      contentType,
    };

    if (isUUID(creditNoteId)) {
      return await downloadCreditNoteBranch(ctx, creditNoteId);
    }
    if (isUUID(paymentId)) {
      return await downloadRepBranch(ctx, paymentId);
    }
    return await downloadInvoiceOrAcuseBranch(
      ctx,
      invoiceId as string,
      isAcuse,
    );
  } catch (err) {
    diag.capture(err, 500, "download_cfdi_unhandled");
    console.error("download-cfdi error:", err);
    return jsonError(req, 500, "Internal server error");
  }
}

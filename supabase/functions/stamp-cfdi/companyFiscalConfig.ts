import { isFacturapiConfigError } from "../_shared/facturapi/client.ts";
import {
  FiscalRetryContextError,
  getRetryAwareFacturapiConfig,
} from "../_shared/facturapi/retryContext.ts";
import { stampOutcome } from "../_shared/stampOutcome.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { ClaimControls, JsonResponder } from "./preStampValidation.ts";

async function issueTestStubCfdi(
  inv: Record<string, unknown>,
  controls: ClaimControls,
  json: JsonResponder,
): Promise<Response> {
  const mockUuid = crypto.randomUUID();
  const mockXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="${inv.serie || ""}" Folio="${inv.folio || ""}"
  Fecha="${new Date().toISOString()}"
  SubTotal="${inv.subtotal}" Total="${inv.total}">
  <tfd:TimbreFiscalDigital UUID="${mockUuid}" />
</cfdi:Comprobante>`;

  const saved = await controls.saveClaim({
    cfdi_uuid: mockUuid,
    cfdi_xml: mockXml,
    cfdi_status: "stamped",
    facturapi_env: "test",
    ...(inv.status === "draft" ? { status: "sent" } : {}),
  });
  if (!saved) {
    return json({
      error: "No se confirmó el registro del timbrado de prueba.",
    }, 503);
  }

  return json({
    success: true,
    cfdi_uuid: mockUuid,
    stub: true,
    ...stampOutcome({ kind: "issued", cfdi_uuid: mockUuid }),
  }, 200);
}

export async function resolveStampFiscalConfig(params: {
  supabase: SupabaseLike;
  env: (key: string) => string | undefined;
  organizationId: string;
  invoiceId: string;
  inv: Record<string, unknown>;
  body: unknown;
  isServiceRole: boolean;
  controls: ClaimControls;
  json: JsonResponder;
}): Promise<
  { ok: false; response: Response } | { ok: true; apiKey: string; mode: string }
> {
  const {
    supabase,
    env,
    organizationId,
    invoiceId,
    inv,
    body,
    isServiceRole,
    controls,
    json,
  } = params;

  const { data: company, error: companyErr } = await supabase
    .from("company_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (companyErr) {
    console.error("[stamp-cfdi] company_settings read error", {
      invoice_id: invoiceId,
      organizationId,
    });
    await controls.releaseClaim(
      "No se pudo leer la configuración fiscal de la empresa. No se emitió CFDI.",
    );
    return {
      ok: false,
      response: json({
        error:
          "No se pudo leer la configuración fiscal de la empresa. Reintenta en unos segundos.",
      }, 503),
    };
  }
  if (!company) {
    console.error("[stamp-cfdi] company_settings missing", {
      invoice_id: invoiceId,
      organizationId,
    });
    await controls.releaseClaim("Company settings not configured");
    return {
      ok: false,
      response: json({ error: "Company settings not configured" }, 400),
    };
  }

  const co = company as Record<string, unknown>;
  let apiKey: string | null;
  let mode: string;
  try {
    const cfg = await getRetryAwareFacturapiConfig({
      admin: supabase,
      env,
      organizationId,
      modeOverride: (co.facturapi_mode as string | undefined) ?? null,
      body,
      isServiceRole,
      documentId: invoiceId,
      operation: "stamp",
    });
    apiKey = cfg.apiKey;
    mode = cfg.mode;
  } catch (err) {
    if (err instanceof FiscalRetryContextError) {
      await controls.releaseClaim(err.message);
      return {
        ok: false,
        response: json({ error: err.message, code: err.code }, err.status),
      };
    }
    if (isFacturapiConfigError(err)) {
      console.error("[stamp-cfdi] configuración fiscal no resoluble", {
        invoice_id: invoiceId,
        organization_id: organizationId,
        code: err.code,
      });
      await controls.releaseClaim(
        "Configuración fiscal de la empresa no resoluble. No se emitió CFDI.",
      );
      return {
        ok: false,
        response: json(
          { error: err.message },
          err.code === "config_read_error" ? 503 : 400,
        ),
      };
    }
    throw err;
  }

  if (!apiKey) {
    if (mode === "live") {
      await controls.releaseClaim(
        "Facturapi API key no configurada para modo live. No se emitió CFDI.",
      );
      return {
        ok: false,
        response: json({
          error:
            "Facturapi API key no configurada para modo live. Configura la key antes de timbrar.",
        }, 400),
      };
    }
    return {
      ok: false,
      response: await issueTestStubCfdi(inv, controls, json),
    };
  }

  return { ok: true, apiKey, mode };
}

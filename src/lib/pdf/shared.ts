import {
  ISSUER_BRANDING_MESSAGES,
  type IssuerDocumentRef,
} from "@/lib/branding/resolveIssuerBranding";
import { formatDateMty } from "@/lib/format/dateFormats";
import { getIssuerBranding } from "@/lib/issuerBranding.functions";
import { loadCompanyLogo } from "@/lib/pdf/assets/logo";

// ─── Types ────────────────────────────────────────────

export interface PdfLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
}

export interface CompanyData {
  razon_social: string;
  rfc: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string | null;
}

/** Error explícito: nunca se cae a la configuración de otra organización. */
export class IssuerUnavailableError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "IssuerUnavailableError";
    this.reason = reason;
  }
}

// ─── Emisor verificado por organización ───────────────

/**
 * Multi-organización (tramo 3): el emisor se resuelve en el servidor desde la
 * organización verificada y, cuando se indica, desde la organización
 * propietaria del documento autorizado. No hay `limit(1)` sobre
 * `company_settings` ni empresa de respaldo.
 */
export async function fetchCompanyDataAndLogo(
  document?: IssuerDocumentRef | null,
): Promise<{ company: CompanyData; logoBase64: string | null }> {
  const payload = await getIssuerBranding({
    data: document ? { documentType: document.type, documentId: document.id } : {},
  });

  if (payload.errorCode || !payload.result) {
    throw new IssuerUnavailableError(
      payload.errorCode ?? "unexpected_error",
      ISSUER_BRANDING_MESSAGES.read_error,
    );
  }

  if (payload.result.status !== "ready") {
    throw new IssuerUnavailableError(
      payload.result.reason,
      ISSUER_BRANDING_MESSAGES[payload.result.reason],
    );
  }

  const b = payload.result.branding;
  const company: CompanyData = {
    razon_social: b.razon_social,
    rfc: b.rfc,
    regimen_fiscal: b.regimen_fiscal,
    lugar_expedicion: b.lugar_expedicion,
    logo_url: b.logo_url,
  };

  const logoBase64 = await loadCompanyLogo(company.logo_url);

  return { company, logoBase64 };
}

// ─── Shared date formatter ────────────────────────────

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const s = formatDateMty(d);
  return s || "—";
}

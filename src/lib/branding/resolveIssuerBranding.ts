/**
 * Multi-organización · Fase 5 (tramo 3): marca y emisor de documentos.
 *
 * La marca pública (`get_public_branding`) sigue siendo LiftGo, fija y sin
 * datos territoriales. Dentro de la aplicación autenticada, en cambio, la
 * razón social, el RFC, el domicilio de expedición y el logo se resuelven
 * SIEMPRE desde la organización verificada en el servidor y, cuando el
 * documento existe, desde la organización propietaria de ese documento.
 *
 * Reglas que este resolver garantiza:
 * - Nunca se toma "el primer" `company_settings` (`limit(1)` sin filtro).
 * - Nunca se acepta un `organization_id` propuesto por el navegador.
 * - Ausencia, ambigüedad o error de lectura producen un estado explícito;
 *   no hay empresa de respaldo ni herencia de datos de otra organización.
 * - No se expone ningún secreto fiscal: sólo configuración pública del
 *   emisor y el indicador de modo (`facturapi_mode`).
 */

import type { OrganizationContextResult } from "@/lib/organization/resolveOrganizationContext";

/** Tipos de documento que pueden pedir emisor, con su tabla propietaria. */
export const ISSUER_DOCUMENT_TABLES = {
  invoice: "invoices",
  credit_note: "credit_notes",
  payment: "payments",
  contract: "contracts",
  quote: "quotes",
  customer: "customers",
  booking: "bookings",
} as const;

export type IssuerDocumentType = keyof typeof ISSUER_DOCUMENT_TABLES;

export interface IssuerDocumentRef {
  type: IssuerDocumentType;
  id: string;
}

export interface IssuerBranding {
  organizationId: string;
  razon_social: string;
  rfc: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string | null;
  /** Indicador existente (test/live). No es un secreto fiscal. */
  facturapi_mode: string | null;
}

export type IssuerBrandingUnavailableReason =
  | "no_organization"
  | "document_not_found"
  | "document_forbidden"
  | "settings_missing"
  | "settings_ambiguous";

export type IssuerBrandingResult =
  | { status: "ready"; branding: IssuerBranding }
  | { status: "unavailable"; reason: IssuerBrandingUnavailableReason };

/** Error de lectura (no confundir con configuración ausente). */
export class IssuerBrandingError extends Error {
  readonly code: "document_read_error" | "settings_read_error";
  constructor(code: IssuerBrandingError["code"], message: string) {
    super(message);
    this.name = "IssuerBrandingError";
    this.code = code;
  }
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

type Row = Record<string, unknown>;

/** Contrato mínimo del cliente Supabase (permite pruebas sin red). */
export interface IssuerBrandingClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        limit(count: number): PromiseLike<QueryResult<Row>>;
      };
    };
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const SETTINGS_COLUMNS =
  "organization_id, razon_social, rfc, regimen_fiscal, lugar_expedicion, logo_url, facturapi_mode";

/**
 * Verifica que el documento pertenezca a la organización verificada y, en el
 * portal, al cliente de la cuenta firmada. Devuelve la organización del
 * documento o un estado explícito de rechazo.
 */
async function resolveDocumentOrganization(
  client: IssuerBrandingClient,
  document: IssuerDocumentRef,
  context: Extract<OrganizationContextResult, { status: "ready" }>,
): Promise<{ ok: true; organizationId: string } | { ok: false; reason: IssuerBrandingUnavailableReason }> {
  const table = ISSUER_DOCUMENT_TABLES[document.type];
  if (!table) return { ok: false, reason: "document_forbidden" };

  const columns = document.type === "customer"
    ? "id, organization_id"
    : "id, organization_id, customer_id";

  const res = await client.from(table).select(columns).eq("id", document.id).limit(2);
  if (res.error) {
    throw new IssuerBrandingError(
      "document_read_error",
      "No se pudo verificar el documento solicitado.",
    );
  }

  const rows = res.data ?? [];
  // RLS ya oculta documentos de otra empresa: 0 filas = no encontrado.
  if (rows.length === 0) return { ok: false, reason: "document_not_found" };
  if (rows.length > 1) return { ok: false, reason: "document_forbidden" };

  const row = rows[0];
  const documentOrg = str(row["organization_id"]);
  if (!documentOrg || documentOrg !== context.organizationId) {
    return { ok: false, reason: "document_forbidden" };
  }

  if (context.memberType === "portal") {
    const owner = document.type === "customer"
      ? str(row["id"])
      : str(row["customer_id"]);
    if (!context.customerId || owner !== context.customerId) {
      return { ok: false, reason: "document_forbidden" };
    }
  }

  return { ok: true, organizationId: documentOrg };
}

/**
 * Resuelve el emisor del documento (o de la organización verificada cuando el
 * documento no aplica, p. ej. reportes agregados de la propia empresa).
 */
export async function resolveIssuerBranding(
  client: IssuerBrandingClient,
  context: OrganizationContextResult,
  document?: IssuerDocumentRef | null,
): Promise<IssuerBrandingResult> {
  if (context.status !== "ready") {
    return { status: "unavailable", reason: "no_organization" };
  }

  let organizationId = context.organizationId;

  if (document) {
    const verified = await resolveDocumentOrganization(client, document, context);
    if (!verified.ok) return { status: "unavailable", reason: verified.reason };
    organizationId = verified.organizationId;
  } else if (context.memberType === "portal") {
    // El portal sólo obtiene emisor a través de un documento autorizado.
    return { status: "unavailable", reason: "document_forbidden" };
  }

  const settings = await client
    .from("company_settings")
    .select(SETTINGS_COLUMNS)
    // Se piden 2 filas a propósito: más de una configuración es ambigüedad.
    .eq("organization_id", organizationId)
    .limit(2);

  if (settings.error) {
    throw new IssuerBrandingError(
      "settings_read_error",
      "No se pudo leer la configuración fiscal de la empresa.",
    );
  }

  const rows = settings.data ?? [];
  if (rows.length === 0) return { status: "unavailable", reason: "settings_missing" };
  if (rows.length > 1) return { status: "unavailable", reason: "settings_ambiguous" };

  const row = rows[0];
  const rowOrg = str(row["organization_id"]);
  // Defensa en profundidad: la fila debe seguir siendo de la misma empresa.
  if (rowOrg !== organizationId) {
    return { status: "unavailable", reason: "settings_ambiguous" };
  }

  return {
    status: "ready",
    branding: {
      organizationId,
      razon_social: str(row["razon_social"]) ?? "",
      rfc: str(row["rfc"]) ?? "",
      regimen_fiscal: str(row["regimen_fiscal"]) ?? "",
      lugar_expedicion: str(row["lugar_expedicion"]) ?? "",
      logo_url: str(row["logo_url"]),
      facturapi_mode: str(row["facturapi_mode"]),
    },
  };
}

/** Mensajes en español mexicano para los estados explícitos. */
export const ISSUER_BRANDING_MESSAGES: Record<IssuerBrandingUnavailableReason | "read_error", string> = {
  no_organization: "Tu cuenta no tiene una empresa verificada para emitir documentos.",
  document_not_found: "No encontramos el documento solicitado en tu empresa.",
  document_forbidden: "El documento solicitado no pertenece a tu empresa.",
  settings_missing: "Tu empresa todavía no tiene datos fiscales capturados.",
  settings_ambiguous: "Tu empresa tiene datos fiscales duplicados; corrígelos antes de emitir.",
  read_error: "No pudimos leer los datos fiscales de tu empresa. Inténtalo de nuevo.",
};

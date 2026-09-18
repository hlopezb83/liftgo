/**
 * Multi-organización · Fase 5 (tramo 1): resolución del contexto de empresa.
 *
 * Fuente de verdad: `organization_memberships` (una membresía por usuario) y,
 * para el portal, `customer_portal_accounts` activa y coherente con esa
 * membresía. Nunca se acepta un `organization_id` enviado por el navegador.
 *
 * Tramo 9: la empresa además debe estar activa (`organizations.is_active`).
 * Una empresa suspendida por el operador de plataforma deja a todos sus
 * miembros (internos y portal) en estado explícito `organization_inactive`.
 *
 * El resolver es puro respecto al transporte: recibe un cliente ya autenticado
 * (server function con `requireSupabaseAuth`) para poder probarse sin red.
 */

export type OrganizationMemberType = "internal" | "portal";

export interface OrganizationContextReady {
  status: "ready";
  organizationId: string;
  memberType: OrganizationMemberType;
  /** Sólo para portal: cliente verificado de la cuenta del portal. */
  customerId: string | null;
}

export interface OrganizationContextMissing {
  status: "no_membership";
  /** Motivo estable para la UI y las pruebas; nunca expone datos de otra empresa. */
  reason:
    | "no_membership"
    | "ambiguous_membership"
    | "organization_inactive"
    | "portal_account_missing"
    | "portal_account_inactive"
    | "portal_organization_mismatch";
}

export type OrganizationContextResult =
  OrganizationContextReady | OrganizationContextMissing;

/** Error de verificación (lectura fallida): estado distinto a "sin membresía". */
export class OrganizationContextError extends Error {
  readonly code:
    | "membership_read_error"
    | "organization_read_error"
    | "portal_account_read_error";
  constructor(code: OrganizationContextError["code"], message: string) {
    super(message);
    this.name = "OrganizationContextError";
    this.code = code;
  }
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** Contrato mínimo del cliente Supabase usado aquí (facilita pruebas sin red). */
export interface OrganizationContextClient {
  from(
    table:
      "organization_memberships" | "customer_portal_accounts" | "organizations",
  ): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        limit(count: number): PromiseLike<QueryResult<Record<string, unknown>>>;
      };
    };
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/**
 * La empresa de la membresía debe existir y estar activa. La fila se lee con el
 * cliente del propio usuario (`org_select_own`): si no es visible o está
 * suspendida, el acceso se niega con el mismo motivo estable.
 */
async function assertOrganizationActive(
  client: OrganizationContextClient,
  organizationId: string,
): Promise<OrganizationContextMissing | null> {
  const organization = await client
    .from("organizations")
    .select("id, is_active")
    .eq("id", organizationId)
    .limit(1);

  if (organization.error) {
    throw new OrganizationContextError(
      "organization_read_error",
      "No se pudo verificar el estado de la empresa.",
    );
  }

  const row = (organization.data ?? [])[0] as
    Record<string, unknown> | undefined;
  if (!row || str(row["id"]) !== organizationId || row["is_active"] !== true) {
    return { status: "no_membership", reason: "organization_inactive" };
  }
  return null;
}

async function resolvePortalAccount(
  client: OrganizationContextClient,
  userId: string,
  organizationId: string,
): Promise<OrganizationContextResult> {
  const portal = await client
    .from("customer_portal_accounts")
    .select("organization_id, customer_id, status")
    .eq("auth_user_id", userId)
    .limit(2);

  if (portal.error) {
    throw new OrganizationContextError(
      "portal_account_read_error",
      "No se pudo verificar la cuenta del portal.",
    );
  }

  const accounts = (portal.data ?? []) as Record<string, unknown>[];
  if (accounts.length === 0)
    return { status: "no_membership", reason: "portal_account_missing" };
  if (accounts.length > 1)
    return { status: "no_membership", reason: "ambiguous_membership" };

  const account = accounts[0] as Record<string, unknown>;
  if (str(account["status"]) !== "active") {
    // Suspendida o revocada: no hay respaldo por `customers.user_id`.
    return { status: "no_membership", reason: "portal_account_inactive" };
  }

  const accountOrg = str(account["organization_id"]);
  const customerId = str(account["customer_id"]);
  if (!accountOrg || !customerId || accountOrg !== organizationId) {
    return { status: "no_membership", reason: "portal_organization_mismatch" };
  }

  return { status: "ready", organizationId, memberType: "portal", customerId };
}

export async function resolveOrganizationContext(
  client: OrganizationContextClient,
  userId: string,
): Promise<OrganizationContextResult> {
  const membership = await client
    .from("organization_memberships")
    .select("organization_id, member_type")
    // Se piden 2 filas a propósito: más de una membresía es ambigüedad, no éxito.
    .eq("auth_user_id", userId)
    .limit(2);

  if (membership.error) {
    throw new OrganizationContextError(
      "membership_read_error",
      "No se pudo verificar la empresa del usuario.",
    );
  }

  const rows = membership.data ?? [];
  if (rows.length === 0)
    return { status: "no_membership", reason: "no_membership" };
  if (rows.length > 1)
    return { status: "no_membership", reason: "ambiguous_membership" };

  const row = rows[0] as Record<string, unknown>;
  const organizationId = str(row["organization_id"]);
  const memberType = str(row["member_type"]);
  if (
    !organizationId ||
    (memberType !== "internal" && memberType !== "portal")
  ) {
    return { status: "no_membership", reason: "no_membership" };
  }

  // Tramo 9: empresa suspendida → sin acceso para internos y portal por igual.
  const inactive = await assertOrganizationActive(client, organizationId);
  if (inactive) return inactive;

  if (memberType === "internal") {
    return { status: "ready", organizationId, memberType, customerId: null };
  }

  return resolvePortalAccount(client, userId, organizationId);
}

/**
 * Auxiliares de lectura/validación de la invitación al portal: validación de
 * entrada, vínculo legado `customers.user_id` y carga del cliente invitable
 * (relación activa con ESTA empresa y sin cuenta de portal aquí).
 *
 * Extraído de `customerPortal.functions.ts` sin cambios de comportamiento; los
 * guards privilegiados llegan por parámetro, no se importan estáticamente.
 */
type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

const ALREADY_HAS_ACCESS = "Customer already has portal access";
const ARCHIVED_OR_NOT_FOUND = "Customer is archived or not found";

export function assertValidInput(g: Guards, customerId: string, email: string) {
  if (!g.isUUID(customerId))
    throw new g.HttpError(400, "customer_id must be a valid UUID");
  if (!g.isEmail(email))
    throw new g.HttpError(400, "A valid email is required");
}

/**
 * Vínculo legado (`customers.user_id`, anterior a `customer_portal_accounts`).
 * Sigue contando como acceso de ESTA empresa sólo si ese usuario no tiene
 * cuenta de portal registrada y su membresía es de esta empresa.
 */
async function legacyLinkBelongsToOrganization(
  g: Guards,
  admin: Admin,
  legacyUserId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: accounts, error: accountsErr } = await admin
    .from("customer_portal_accounts")
    .select("id")
    .eq("auth_user_id", legacyUserId)
    .limit(1);
  if (accountsErr) {
    console.error(
      "[invite-customer] legacy portal account:",
      accountsErr.message,
    );
    throw new g.HttpError(
      503,
      "No se pudo verificar el cliente. Reintenta en unos segundos.",
    );
  }
  if ((accounts ?? []).length > 0) return false; // ya migrado: manda la cuenta scoped

  const { data: memberships, error: membershipErr } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("auth_user_id", legacyUserId)
    .limit(2);
  if (membershipErr) {
    console.error(
      "[invite-customer] legacy membership:",
      membershipErr.message,
    );
    throw new g.HttpError(
      503,
      "No se pudo verificar el cliente. Reintenta en unos segundos.",
    );
  }
  return (memberships ?? []).some((m) => m.organization_id === organizationId);
}

/** Cliente activo, relacionado con la empresa del staff y sin acceso al portal EN ESTA empresa. */
export async function loadInvitableCustomer(
  g: Guards,
  admin: Admin,
  customerId: string,
  organizationId: string,
) {
  // Tramo 5: la relación comercial con ESTA empresa es el permiso de invitar.
  const { data: relation, error: relationErr } = await admin
    .from("organization_customers")
    .select("customer_id, status")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (relationErr) {
    console.error(
      "[invite-customer] organization_customers:",
      relationErr.message,
    );
    throw new g.HttpError(
      503,
      "No se pudo verificar el cliente. Reintenta en unos segundos.",
    );
  }
  if (!relation || relation.status !== "active") {
    // Cliente de otra empresa e inexistente responden igual: no se filtra cuál.
    throw new g.HttpError(409, ARCHIVED_OR_NOT_FOUND);
  }

  const { data: customer, error } = await admin
    .from("customers")
    .select("id, user_id, name, deleted_at")
    .eq("id", customerId)
    .is("deleted_at", null)
    .single();

  if (error || !customer) {
    // N-31: archivado o inexistente, sin filtrar cuál de los dos.
    throw new g.HttpError(409, ARCHIVED_OR_NOT_FOUND);
  }

  // Tramo 9: cuenta de portal de ESTA empresa (activa o suspendida) = ya invitado.
  const { data: scoped, error: scopedErr } = await admin
    .from("customer_portal_accounts")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .in("status", ["active", "suspended"])
    .limit(1);
  if (scopedErr) {
    console.error(
      "[invite-customer] customer_portal_accounts:",
      scopedErr.message,
    );
    throw new g.HttpError(
      503,
      "No se pudo verificar el cliente. Reintenta en unos segundos.",
    );
  }
  if ((scoped ?? []).length > 0) {
    throw new g.HttpError(409, ALREADY_HAS_ACCESS);
  }

  if (
    customer.user_id &&
    (await legacyLinkBelongsToOrganization(
      g,
      admin,
      customer.user_id,
      organizationId,
    ))
  ) {
    throw new g.HttpError(409, ALREADY_HAS_ACCESS);
  }
  return customer;
}

/**
 * Invitación al portal de clientes (antes Edge Function invite-customer).
 * Mismas reglas y mensajes; sólo cambia el transporte.
 *
 * Tramo 9 multiempresa: el acceso al portal es POR EMPRESA.
 *  · El permiso de invitar es la relación comercial activa con ESTA empresa.
 *  · "Ya tiene acceso" se decide por `customer_portal_accounts` de esta
 *    empresa, no por el vínculo global legado `customers.user_id` (un cliente
 *    compartido puede tener portal en otra empresa y aquí no).
 *  · `customers.user_id` sólo se escribe si estaba vacío; nunca se pisa el
 *    vínculo legado de otra empresa.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertValidInput,
  loadInvitableCustomer,
} from "./customerPortal.helpers";
import { buildPortalLink, linkPortalAccess } from "./customerPortal.link";

export interface InviteCustomerResult {
  success: boolean;
  user_id: string;
  portal_link?: string;
}

type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

async function createPortalUser(
  g: Guards,
  admin: Admin,
  email: string,
  fullName: string,
  organizationId: string,
) {
  const tempPassword = g.generateSecurePassword(24);
  const { data: newUser, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    // Tramo 12 (0033): el contexto de empresa va en `app_metadata` (sólo
    // service role); `handle_new_user` ignora `user_metadata.organization_id`.
    // La membresía y la cuenta las crea linkPortalAccess.
    user_metadata: { full_name: fullName },
    app_metadata: { organization_id: organizationId },
  });

  if (error || !newUser?.user) {
    const msg = error?.message || "";
    const status = /already|registered|exists/i.test(msg) ? 409 : 400;
    console.error("[invite-customer] createUser:", error);
    throw new g.HttpError(
      status,
      status === 409
        ? "Ya existe un usuario con ese correo"
        : "No se pudo procesar la solicitud",
    );
  }
  return newUser.user.id;
}

export const inviteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { customer_id: string; email: string }) => data)
  .handler(async ({ data, context }): Promise<InviteCustomerResult> => {
    const g = await import("./server/adminGuards.server");
    // El módulo Clientes concede acceso "full" a admin y administrativo.
    const { admin } = await g.requireRole(context.supabase, context.userId, [
      "admin",
      "administrativo",
    ]);
    const organizationId = await g.requireInternalOrganization(
      context.supabase,
      context.userId,
    );
    await g.enforceRateLimit(admin, "invite-customer", context.userId);

    const { customer_id, email } = data;
    assertValidInput(g, customer_id, email);

    const customer = await loadInvitableCustomer(
      g,
      admin,
      customer_id,
      organizationId,
    );
    const userId = await createPortalUser(
      g,
      admin,
      email,
      customer.name,
      organizationId,
    );
    await linkPortalAccess(g, admin, {
      userId,
      customerId: customer_id,
      fullName: customer.name,
      organizationId,
      email,
    });

    const portalLink = await buildPortalLink(admin, email);
    return portalLink
      ? { success: true, user_id: userId, portal_link: portalLink }
      : { success: true, user_id: userId };
  });

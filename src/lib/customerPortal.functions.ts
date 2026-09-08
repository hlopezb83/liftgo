/**
 * Invitación al portal de clientes (antes Edge Function invite-customer).
 * Mismas reglas y mensajes; sólo cambia el transporte.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface InviteCustomerResult {
  success: boolean;
  user_id: string;
  portal_link?: string;
}

type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

function assertValidInput(g: Guards, customerId: string, email: string) {
  if (!g.isUUID(customerId)) throw new g.HttpError(400, "customer_id must be a valid UUID");
  if (!g.isEmail(email)) throw new g.HttpError(400, "A valid email is required");
}

/** Cliente activo y todavía sin acceso al portal. */
async function loadInvitableCustomer(g: Guards, admin: Admin, customerId: string) {
  const { data: customer, error } = await admin
    .from("customers")
    .select("id, user_id, name, deleted_at")
    .eq("id", customerId)
    .is("deleted_at", null)
    .single();

  if (error || !customer) {
    // N-31: archivado o inexistente, sin filtrar cuál de los dos.
    throw new g.HttpError(409, "Customer is archived or not found");
  }
  if (customer.user_id) {
    throw new g.HttpError(409, "Customer already has portal access");
  }
  return customer;
}

async function createPortalUser(g: Guards, admin: Admin, email: string, fullName: string) {
  const tempPassword = g.generateSecurePassword(24);
  const { data: newUser, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
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

/**
 * Enlaza rol, perfil y cliente. Cualquier fallo deshace el usuario recién
 * creado para no dejar accesos huérfanos.
 */
async function linkPortalAccess(
  g: Guards,
  admin: Admin,
  opts: { userId: string; customerId: string; fullName: string },
) {
  const { userId, customerId, fullName } = opts;
  const cleanup = async () => {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.error("invite-customer cleanup deleteUser failed:", delErr);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
  };

  // El trigger handle_new_user ya creó profile + rol customer: upsert/update.
  const steps: [string, Promise<{ error: unknown }>][] = [
    [
      "upsert user_roles",
      admin.from("user_roles").upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id" }),
    ],
    ["update profiles", admin.from("profiles").update({ full_name: fullName }).eq("user_id", userId)],
    ["link customer", admin.from("customers").update({ user_id: userId }).eq("id", customerId)],
  ];

  for (const [label, step] of steps) {
    const { error } = await step;
    if (error) {
      console.error(`invite-customer ${label} failed:`, error);
      await cleanup();
      throw new g.HttpError(500, "Internal server error");
    }
  }
}

/** Enlace de acceso de un solo uso para compartir con el cliente. */
async function buildPortalLink(admin: Admin, email: string): Promise<string | undefined> {
  const redirectTo = `${
    process.env["PORTAL_SITE_URL"] ?? "https://liftgo.lovable.app"
  }/auth`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    console.error("[invite-customer] generateLink failed", {
      code: (error as { code?: string } | null)?.code ?? "unknown",
      status: (error as { status?: number } | null)?.status ?? 0,
    });
    // El acceso ya quedó creado; el staff puede reintentar el enlace.
    return undefined;
  }
  return data.properties.action_link;
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
    await g.enforceRateLimit(admin, "invite-customer", context.userId);

    const { customer_id, email } = data;
    assertValidInput(g, customer_id, email);

    const customer = await loadInvitableCustomer(g, admin, customer_id);
    const userId = await createPortalUser(g, admin, email, customer.name);
    await linkPortalAccess(g, admin, { userId, customerId: customer_id, fullName: customer.name });

    const portalLink = await buildPortalLink(admin, email);
    return portalLink
      ? { success: true, user_id: userId, portal_link: portalLink }
      : { success: true, user_id: userId };
  });

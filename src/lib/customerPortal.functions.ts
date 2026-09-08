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
    if (!g.isUUID(customer_id)) {
      throw new g.HttpError(400, "customer_id must be a valid UUID");
    }
    if (!g.isEmail(email)) {
      throw new g.HttpError(400, "A valid email is required");
    }

    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, user_id, name, deleted_at")
      .eq("id", customer_id)
      .is("deleted_at", null)
      .single();

    if (custErr || !customer) {
      // N-31: archivado o inexistente, sin filtrar cuál de los dos.
      throw new g.HttpError(409, "Customer is archived or not found");
    }
    if (customer.user_id) {
      throw new g.HttpError(409, "Customer already has portal access");
    }

    const tempPassword = g.generateSecurePassword(24);
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: customer.name },
    });

    if (createErr || !newUser?.user) {
      const msg = createErr?.message || "";
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      console.error("[invite-customer] createUser:", createErr);
      throw new g.HttpError(
        status,
        status === 409
          ? "Ya existe un usuario con ese correo"
          : "No se pudo procesar la solicitud",
      );
    }

    const userId = newUser.user.id;

    const cleanupInvitedUser = async () => {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error("invite-customer cleanup deleteUser failed:", delErr);
      }
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("user_id", userId);
    };

    // El trigger handle_new_user ya creó profile + rol customer: upsert/update.
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id" });
    if (roleErr) {
      console.error("invite-customer upsert user_roles failed:", roleErr);
      await cleanupInvitedUser();
      throw new g.HttpError(500, "Internal server error");
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ full_name: customer.name })
      .eq("user_id", userId);
    if (profileErr) {
      console.error("invite-customer update profiles failed:", profileErr);
      await cleanupInvitedUser();
      throw new g.HttpError(500, "Internal server error");
    }

    const { error: linkCustErr } = await admin
      .from("customers")
      .update({ user_id: userId })
      .eq("id", customer_id);
    if (linkCustErr) {
      console.error("invite-customer link customer failed:", linkCustErr);
      await cleanupInvitedUser();
      throw new g.HttpError(500, "Internal server error");
    }

    // Enlace de acceso de un solo uso para compartir con el cliente.
    const redirectTo = `${
      process.env["PORTAL_SITE_URL"] ?? "https://liftgo.lovable.app"
    }/auth`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[invite-customer] generateLink failed", {
        code: (linkErr as { code?: string } | null)?.code ?? "unknown",
        status: (linkErr as { status?: number } | null)?.status ?? 0,
      });
      // El acceso ya quedó creado; el staff puede reintentar el enlace.
      return { success: true, user_id: userId };
    }

    return {
      success: true,
      user_id: userId,
      portal_link: linkData.properties.action_link,
    };
  });

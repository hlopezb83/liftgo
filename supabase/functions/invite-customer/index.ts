import { handleCors } from "../_shared/cors.ts";
import {
  enforceRateLimit,
  generateSecurePassword,
  requireRole,
} from "../_shared/auth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isEmail, isUUID } from "../_shared/validate.ts";
import { provisionCustomerAccess } from "./provision.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // El módulo Clientes concede acceso "full" a admin y administrativo; la
    // invitación al portal se alinea con esa matriz (antes exigía sólo admin).
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "invite-customer",
      auth.userId,
    );
    if (limited) return limited;

    const { customer_id, email } = await req.json();

    if (!isUUID(customer_id)) {
      return jsonError(req, 400, "customer_id must be a valid UUID");
    }
    if (!isEmail(email)) {
      return jsonError(req, 400, "A valid email is required");
    }

    const { data: customer, error: custErr } = await auth.adminClient
      .from("customers")
      .select("id, user_id, name, deleted_at")
      .eq("id", customer_id)
      .is("deleted_at", null)
      .single();

    if (custErr || !customer) {
      // N-31: si el cliente esta archivado (deleted_at NOT NULL) no se puede
      // invitar al portal; respondemos 409 sin filtrar si existe o no.
      return jsonError(req, 409, "Customer is archived or not found");
    }
    if (customer.user_id) {
      return jsonError(req, 409, "Customer already has portal access");
    }

    // Contraseña segura no predecible (rejection sampling, sin sufijo fijo).
    const tempPassword = generateSecurePassword(24);
    const { data: newUser, error: createErr } = await auth.adminClient.auth
      .admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: customer.name },
      });

    if (createErr) {
      // M-16b: mensaje genérico al cliente; el error crudo queda en el log.
      console.error("[invite-customer] createUser:", createErr);
      return jsonError(req, 400, "No se pudo procesar la solicitud");
    }

    const userId = newUser.user.id;

    // Compensacion: si alguna escritura falla, borrar el usuario de auth
    // creado (el resto cae en cascade / limpieza best-effort, como delete-user)
    // para no dejar una cuenta huerfana a medias.
    const cleanupInvitedUser = async () => {
      const { error: delErr } = await auth.adminClient.auth.admin.deleteUser(
        userId,
      );
      if (delErr) {
        console.error("invite-customer cleanup deleteUser failed:", delErr);
      }
      await auth.adminClient.from("user_roles").delete().eq("user_id", userId);
      await auth.adminClient.from("profiles").delete().eq("user_id", userId);
    };

    const provisioned = await provisionCustomerAccess(auth.adminClient, {
      userId,
      customerId: customer_id,
      fullName: customer.name,
    });
    if (!provisioned.ok) {
      await cleanupInvitedUser();
      return jsonError(req, 500, "Internal server error");
    }

    // IMPORTANTE: admin.generateLink() sólo genera el enlace, NO envía correo.
    // resetPasswordForEmail() sí dispara el correo de acceso al portal.
    const redirectTo = `${
      Deno.env.get("PORTAL_SITE_URL") ?? "https://liftgo.lovable.app"
    }/auth`;
    const { error: resetErr } = await auth.adminClient.auth
      .resetPasswordForEmail(email, { redirectTo });

    if (resetErr) {
      console.error("Password reset email failed", {
        code: (resetErr as { code?: string }).code ?? "unknown",
        status: (resetErr as { status?: number }).status ?? 0,
      });
    }


    return jsonResponse(req, { success: true, user_id: userId });
  } catch (_err) {
    console.error("invite-customer error:", _err);
    return jsonError(req, 500, "Internal server error");
  }
});

/**
 * Alta del acceso al portal: enlaza rol, perfil, membresía y cuenta de portal
 * de ESTA empresa, con limpieza del usuario recién creado ante cualquier
 * fallo, y construye el enlace de acceso de un solo uso.
 *
 * Extraído de `customerPortal.functions.ts` sin cambios de comportamiento.
 */
type Guards = typeof import("./server/adminGuards.server");
type Admin = Awaited<ReturnType<Guards["requireRole"]>>["admin"];

/**
 * Enlaza rol, perfil, membresía y cuenta de portal. Cualquier fallo deshace el
 * usuario recién creado para no dejar accesos huérfanos.
 */
export async function linkPortalAccess(
  g: Guards,
  admin: Admin,
  opts: {
    userId: string;
    customerId: string;
    fullName: string;
    organizationId: string;
    email: string;
  },
) {
  const { userId, customerId, fullName, organizationId, email } = opts;
  let legacyLinkWritten = false;
  const cleanup = async () => {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr)
      console.error("invite-customer cleanup deleteUser failed:", delErr);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    await admin
      .from("customer_portal_accounts")
      .delete()
      .eq("auth_user_id", userId);
    await admin
      .from("organization_memberships")
      .delete()
      .eq("auth_user_id", userId);
    if (legacyLinkWritten) {
      await admin
        .from("customers")
        .update({ user_id: null })
        .eq("id", customerId)
        .eq("user_id", userId);
    }
  };

  // El trigger handle_new_user ya creó profile + rol customer: upsert/update.
  const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
    [
      "upsert user_roles",
      () =>
        admin
          .from("user_roles")
          .upsert(
            { user_id: userId, role: "customer" },
            { onConflict: "user_id" },
          ),
    ],
    [
      "update profiles",
      () =>
        admin
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", userId),
    ],
    // Tramo 5: la cuenta de portal y su membresía quedan atadas a UNA empresa.
    [
      "portal membership",
      () =>
        admin.from("organization_memberships").insert({
          auth_user_id: userId,
          organization_id: organizationId,
          member_type: "portal",
        }),
    ],
    [
      "portal account",
      () =>
        admin.from("customer_portal_accounts").insert({
          auth_user_id: userId,
          organization_id: organizationId,
          customer_id: customerId,
          email: email.toLowerCase(),
          status: "active",
        }),
    ],
    // Compatibilidad: el vínculo legado sólo se escribe si estaba vacío. Si el
    // cliente ya tiene portal en otra empresa, ese vínculo no se toca.
    [
      "legacy link customer",
      async () => {
        const { data, error } = await admin
          .from("customers")
          .update({ user_id: userId })
          .eq("id", customerId)
          .is("user_id", null)
          .select("id");
        legacyLinkWritten = !error && (data?.length ?? 0) > 0;
        return { error };
      },
    ],
  ];

  for (const [label, step] of steps) {
    const { error } = await step();
    if (error) {
      console.error(`invite-customer ${label} failed:`, error);
      await cleanup();
      throw new g.HttpError(500, "Internal server error");
    }
  }
}

/** Enlace de acceso de un solo uso para compartir con el cliente. */
export async function buildPortalLink(
  admin: Admin,
  email: string,
): Promise<string | undefined> {
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

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ProvisionOk {
  ok: true;
}
export interface ProvisionError {
  ok: false;
  step: "role" | "profile" | "link";
}

/**
 * Provisiona el acceso al portal para un usuario recién creado.
 *
 * IMPORTANTE: el trigger `on_auth_user_created` → `handle_new_user()` YA crea
 * la fila de `profiles` y el rol `customer`. Por eso aquí NO se hacen INSERT
 * planos (chocaban con `profiles_user_id_key`, `user_roles_user_id_role_key` y
 * `user_roles_one_role_per_user` → 23505, y el rollback borraba la cuenta
 * recién creada: toda invitación fallaba con 500).
 *
 * Se usa `upsert` para el rol (mismo patrón que `invite-user/assignRole.ts`) y
 * `update` para el perfil, ambos idempotentes.
 */
export async function provisionCustomerAccess(
  adminClient: SupabaseClient,
  params: { userId: string; customerId: string; fullName: string },
): Promise<ProvisionOk | ProvisionError> {
  const { userId, customerId, fullName } = params;

  const { error: roleErr } = await adminClient
    .from("user_roles")
    .upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id" });
  if (roleErr) {
    console.error("invite-customer upsert user_roles failed:", roleErr);
    return { ok: false, step: "role" };
  }

  const { error: profileErr } = await adminClient
    .from("profiles")
    .update({ full_name: fullName })
    .eq("user_id", userId);
  if (profileErr) {
    console.error("invite-customer update profiles failed:", profileErr);
    return { ok: false, step: "profile" };
  }

  const { error: linkErr } = await adminClient
    .from("customers")
    .update({ user_id: userId })
    .eq("id", customerId);
  if (linkErr) {
    console.error("invite-customer link customer failed:", linkErr);
    return { ok: false, step: "link" };
  }

  return { ok: true };
}

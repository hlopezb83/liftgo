import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AssignRoleResult {
  ok: true;
}

export interface AssignRoleError {
  ok: false;
  message: string;
}

/**
 * DB2-01: asigna el rol al usuario recién creado usando el índice único
 * vigente `user_roles_one_role_per_user` (user_id). El upsert sobre
 * `user_id,role` reventaba con duplicate key; al solo loguearse, el prune
 * posterior borraba el rol residual y el invitado quedaba SIN rol.
 *
 * Esta función es pura de orquestación y puede testearse con un mock del
 * cliente admin.
 */
export async function assignRoleToUser(
  adminClient: SupabaseClient,
  userId: string,
  role: string,
): Promise<AssignRoleResult | AssignRoleError> {
  const { error: roleErr } = await adminClient
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });

  if (roleErr) {
    console.error("[invite-user] no se pudo asignar rol", {
      userId,
      role,
      err: roleErr,
    });
    return {
      ok: false,
      message:
        "No se pudo asignar el rol al usuario invitado. Reintenta o contacta a soporte.",
    };
  }

  return { ok: true };
}

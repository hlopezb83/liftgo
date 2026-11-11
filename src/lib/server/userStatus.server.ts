import { HttpError, type AdminClient } from "./guards/httpError";

type ProfileStatus = { is_active: boolean; updated_at: string };

export type UserStatusResult =
  | { status: "synchronized"; is_active: boolean }
  | { status: "auth_sync_pending"; profile: ProfileStatus; desired_is_active: boolean }
  | { status: "session_revocation_pending"; profile: ProfileStatus }
  | { status: "superseded" | "profile_state_unconfirmed" };

function sameProfileStatus(left: ProfileStatus, right: ProfileStatus) {
  return left.updated_at === right.updated_at && left.is_active === right.is_active;
}

export async function setUserStatus(
  admin: AdminClient,
  userId: string,
  isActive: boolean,
  expectedVersion?: string,
): Promise<UserStatusResult> {
  const readProfile = () => admin.from("profiles")
    .select("is_active, updated_at").eq("user_id", userId).maybeSingle();
  const writeProfile = (previous: ProfileStatus, active: boolean) => {
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous.updated_at) + 1)).toISOString();
    return admin.from("profiles").update({ is_active: active, updated_at: updatedAt })
      .eq("user_id", userId).eq("updated_at", previous.updated_at)
      .eq("is_active", previous.is_active).select("is_active, updated_at").maybeSingle();
  };

  const { data: previous, error: readError } = await readProfile();
  if (readError || !previous) throw new HttpError(503, "No se pudo verificar el estado del usuario.");
  if (expectedVersion !== undefined && previous.updated_at !== expectedVersion) {
    return { status: "superseded" };
  }
  const { data: changed, error: writeError } = await writeProfile(previous, isActive);
  if (writeError) throw new HttpError(409, "No se pudo actualizar el estado del usuario.");
  if (!changed) return { status: "superseded" };

  const readVerifiedProfile = async (): Promise<ProfileStatus | null> => {
    try {
      const { data, error } = await readProfile();
      return error ? null : data;
    } catch {
      return null;
    }
  };

  const syncAuth = async (active: boolean): Promise<boolean> => {
    try {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : "876600h",
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("[toggle-user-status] Auth synchronization failed:", error);
      return false;
    }
  };

  // A late Auth write can undo a newer request. Repair from the latest observed
  // profile, then verify its version before reporting the repair as complete.
  const reconcileAuth = async (
    profile: ProfileStatus,
    confirmedAuthState?: boolean,
  ): Promise<UserStatusResult> => {
    if (profile.is_active === confirmedAuthState) return { status: "superseded" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const synced = await syncAuth(profile.is_active);
      const latest = await readVerifiedProfile();
      if (!latest) return { status: "profile_state_unconfirmed" };
      if (synced && latest.is_active === profile.is_active) return { status: "superseded" };
      if (sameProfileStatus(latest, profile)) break;
      profile = latest;
    }
    return { status: "auth_sync_pending", profile, desired_is_active: profile.is_active };
  };

  const finish = async (pending?: "auth_sync_pending" | "session_revocation_pending"): Promise<UserStatusResult> => {
    const latest = await readVerifiedProfile();
    if (!latest) return { status: "profile_state_unconfirmed" };
    if (!sameProfileStatus(latest, changed)) {
      return reconcileAuth(latest, pending === "auth_sync_pending" ? undefined : isActive);
    }
    if (pending === "auth_sync_pending") {
      return { status: pending, profile: latest, desired_is_active: isActive };
    }
    if (pending === "session_revocation_pending") return { status: pending, profile: latest };
    return { status: "synchronized", is_active: isActive };
  };

  const restoreInactiveProfile = async (): Promise<UserStatusResult> => {
    try {
      const { data: restored, error } = await writeProfile(changed, false);
      if (error) return { status: "profile_state_unconfirmed" };
      if (!restored) return finish("auth_sync_pending");
      // Another request may have already unbanned Auth against the profile
      // version we just rolled back.
      const synced = await syncAuth(false);
      const latest = await readVerifiedProfile();
      if (!latest) return { status: "profile_state_unconfirmed" };
      if (!sameProfileStatus(latest, restored)) return reconcileAuth(latest, synced ? false : undefined);
      return { status: "auth_sync_pending", profile: latest, desired_is_active: true };
    } catch {
      return { status: "profile_state_unconfirmed" };
    }
  };

  const revokeSessions = async (): Promise<UserStatusResult> => {
    const latest = await readVerifiedProfile();
    if (!latest) return { status: "profile_state_unconfirmed" };
    if (!sameProfileStatus(latest, changed)) return reconcileAuth(latest, false);
    try {
      const { error } = await admin.rpc("revoke_user_sessions", { _user_id: userId });
      if (error) throw error;
    } catch (error) {
      console.error("[toggle-user-status] Session revocation failed:", error);
      return finish("session_revocation_pending");
    }
    return finish();
  };

  if (!await syncAuth(isActive)) {
    // Keep the profile inactive while a disable is pending. On failed activation,
    // restore the prior restriction only if this request still owns the version.
    return isActive && !previous.is_active ? restoreInactiveProfile() : finish("auth_sync_pending");
  }

  return isActive ? finish() : revokeSessions();
}

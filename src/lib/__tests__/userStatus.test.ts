import { describe, expect, it, vi } from "vitest";
import type { AdminClient } from "../server/guards/httpError";
import { setUserStatus } from "../server/userStatus.server";

const initialVersion = "2026-01-01T00:00:00.000Z";
const userId = "fixture-user";

function fixture(active: boolean) {
  const profile = { user_id: userId, is_active: active, updated_at: initialVersion };
  const auth = { ban: active ? "none" : "876600h" };
  const applyBan = (_id: string, { ban_duration }: { ban_duration: string }) => {
    auth.ban = ban_duration;
    return { error: null as Error | null };
  };
  const updateUserById = vi.fn(async (...args: Parameters<typeof applyBan>) => applyBan(...args));
  const rpc = vi.fn(async () => ({ error: null as Error | null }));
  const writes: Partial<typeof profile>[] = [];
  let failReads = false;
  const from = () => {
    const conditions = new Map<string, unknown>();
    let patch: Partial<typeof profile> | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { conditions.set(key, value); return query; },
      update: (values: Partial<typeof profile>) => { patch = values; return query; },
      maybeSingle: async () => {
        if (!patch && failReads) return { data: null, error: new Error("offline") };
        if ([...conditions].some(([key, value]) => Reflect.get(profile, key) !== value)) {
          return { data: null, error: null };
        }
        if (patch) { writes.push(patch); Object.assign(profile, patch); }
        return { data: { is_active: profile.is_active, updated_at: profile.updated_at }, error: null };
      },
    };
    return query;
  };
  const admin = { from, rpc, auth: { admin: { updateUserById } } } as unknown as AdminClient;
  const delayNextAuthWrite = (error?: Error) => {
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    updateUserById.mockImplementationOnce(async (...args) => {
      markStarted();
      await gate;
      return error ? { error } : applyBan(...args);
    });
    return { started, release };
  };
  return { admin, profile, auth, writes, updateUserById, rpc, delayNextAuthWrite, failReads: () => { failReads = true; } };
}

describe("account status synchronization", () => {
  it("preserves deactivation when Auth cannot confirm the ban and supports a versioned retry", async () => {
    const f = fixture(true);
    f.updateUserById.mockRejectedValueOnce(new Error("offline"));
    const result = await setUserStatus(f.admin, userId, false);
    expect(result).toEqual({
      status: "auth_sync_pending",
      profile: { is_active: false, updated_at: f.profile.updated_at },
      desired_is_active: false,
    });
    expect(f.profile.is_active).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
    await expect(setUserStatus(f.admin, userId, false, f.profile.updated_at)).resolves.toEqual({
      status: "synchronized", is_active: false,
    });
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("revoke_user_sessions", { _user_id: userId });
  });

  it("restores the actual prior state when activation fails", async () => {
    const f = fixture(false);
    f.updateUserById.mockResolvedValueOnce({ error: new Error("rejected") });
    await expect(setUserStatus(f.admin, userId, true)).resolves.toMatchObject({
      status: "auth_sync_pending", profile: { is_active: false }, desired_is_active: true,
    });
    expect(f.writes.map((patch) => patch.is_active)).toEqual([true, false]);
    expect(f.profile.updated_at).not.toBe(initialVersion);
  });

  it("leaves a concurrent change intact when activation fails", async () => {
    const f = fixture(false);
    f.updateUserById.mockImplementationOnce(async () => {
      f.profile.updated_at = "2040-01-01T00:00:00.000Z";
      return { error: new Error("rejected") };
    });
    await expect(setUserStatus(f.admin, userId, true)).resolves.toEqual({ status: "superseded" });
    expect(f.writes).toHaveLength(1);
    expect(f.profile.is_active).toBe(true);
  });

  it("returns partial deactivation on revocation failure and rejects stale retries", async () => {
    const f = fixture(true);
    f.rpc.mockResolvedValueOnce({ error: new Error("unavailable") });
    const result = await setUserStatus(f.admin, userId, false);
    const pendingVersion = f.profile.updated_at;
    expect(result).toEqual({
      status: "session_revocation_pending",
      profile: { is_active: false, updated_at: pendingVersion },
    });
    await setUserStatus(f.admin, userId, true);
    await expect(setUserStatus(f.admin, userId, false, pendingVersion)).resolves.toEqual({ status: "superseded" });
    expect(f.updateUserById).toHaveBeenCalledTimes(2);
    expect(f.profile.is_active).toBe(true);
  });

  it.each([true, false])("repairs a late Auth write when the latest profile is active=%s", async (active) => {
    const f = fixture(active);
    const first = f.delayNextAuthWrite();
    const stale = setUserStatus(f.admin, userId, !active);
    await first.started;
    await expect(setUserStatus(f.admin, userId, active)).resolves.toEqual({ status: "synchronized", is_active: active });
    const latestVersion = f.profile.updated_at;
    first.release();

    await expect(stale).resolves.toEqual({ status: "superseded" });
    expect(f.profile).toMatchObject({ is_active: active, updated_at: latestVersion });
    expect(f.auth.ban).toBe(active ? "none" : "876600h");
    expect(f.updateUserById).toHaveBeenCalledTimes(3);
    expect(f.rpc).toHaveBeenCalledTimes(active ? 0 : 1);
  });

  it("returns a retry for the newer profile when Auth repair fails", async () => {
    const f = fixture(true);
    const first = f.delayNextAuthWrite();
    const stale = setUserStatus(f.admin, userId, false);
    await first.started;
    await setUserStatus(f.admin, userId, true);
    f.updateUserById.mockResolvedValueOnce({ error: new Error("offline") });
    first.release();

    await expect(stale).resolves.toEqual({
      status: "auth_sync_pending", desired_is_active: true,
      profile: { is_active: true, updated_at: f.profile.updated_at },
    });
    expect(f.auth.ban).toBe("876600h");
    await expect(setUserStatus(f.admin, userId, true, f.profile.updated_at)).resolves.toEqual({ status: "synchronized", is_active: true });
    expect(f.auth.ban).toBe("none");
  });

  it("rechecks the profile when another change completes during repair", async () => {
    const f = fixture(true);
    const first = f.delayNextAuthWrite();
    const stale = setUserStatus(f.admin, userId, false);
    await first.started;
    await setUserStatus(f.admin, userId, true);
    const repair = f.delayNextAuthWrite();
    first.release();
    await repair.started;
    await setUserStatus(f.admin, userId, false);
    const latestVersion = f.profile.updated_at;
    repair.release();

    await expect(stale).resolves.toEqual({ status: "superseded" });
    expect(f.profile).toMatchObject({ is_active: false, updated_at: latestVersion });
    expect(f.auth.ban).toBe("876600h");
    expect(f.updateUserById).toHaveBeenCalledTimes(5);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns an unconfirmed result when the current profile cannot be read", async () => {
    const f = fixture(true);
    const first = f.delayNextAuthWrite();
    const stale = setUserStatus(f.admin, userId, false);
    await first.started;
    await setUserStatus(f.admin, userId, true);
    f.failReads();
    first.release();

    await expect(stale).resolves.toEqual({ status: "profile_state_unconfirmed" });
    expect(f.updateUserById).toHaveBeenCalledTimes(2);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("restores the Auth ban when the activation profile was already used for repair", async () => {
    const f = fixture(true);
    const first = f.delayNextAuthWrite();
    const stale = setUserStatus(f.admin, userId, false);
    await first.started;
    const failedActivation = f.delayNextAuthWrite(new Error("unavailable"));
    const activation = setUserStatus(f.admin, userId, true);
    await failedActivation.started;
    first.release();
    await expect(stale).resolves.toEqual({ status: "superseded" });
    expect(f.auth.ban).toBe("none");
    failedActivation.release();

    const result = await activation;
    expect(result).toEqual({
      status: "auth_sync_pending", desired_is_active: true,
      profile: { is_active: false, updated_at: f.profile.updated_at },
    });
    expect(f.auth.ban).toBe("876600h");
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

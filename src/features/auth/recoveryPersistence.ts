/** UI-only recovery continuity. Never stores a bearer token or grants access. */
export type RecoveryAuthSession = {
  user?: { id?: string } | null;
  access_token?: string;
} | null;

type RecoveryIdentity = { userId: string; sessionId: string };
type RecoveryRecord = RecoveryIdentity & { phase: "unfinished" | "completed" };
export const RECOVERY_STORAGE_KEY = "liftgo:password-recovery:v1";
let activeIdentity: RecoveryIdentity | null = null;
let memoryRecord: RecoveryRecord | null = null;

/** Claims belong to the SDK-established session, not an arbitrary URL token. */
export function recoverySessionIdentity(session: RecoveryAuthSession): RecoveryIdentity | null {
  if (!session?.user?.id || !session.access_token) return null;
  try {
    const part = session.access_token.split(".")[1];
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: unknown };
    return typeof claims.session_id === "string" && claims.session_id.length > 0
      ? { userId: session.user.id, sessionId: claims.session_id }
      : null;
  } catch {
    return null;
  }
}

function read(): RecoveryRecord | null {
  try {
    const raw = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as RecoveryRecord;
    return typeof value.userId === "string" && typeof value.sessionId === "string" &&
      (value.phase === "unfinished" || value.phase === "completed") ? value : null;
  } catch {
    return memoryRecord;
  }
}

function matches(a: RecoveryIdentity | null, b: RecoveryIdentity | null): boolean {
  return !!a && !!b && a.userId === b.userId && a.sessionId === b.sessionId;
}

function write(record: RecoveryRecord): void {
  memoryRecord = record;
  try { window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(record)); } catch { /* blocked storage: in-memory flow remains usable */ }
}

export function rememberedRecoveryPhase(session: RecoveryAuthSession): RecoveryRecord["phase"] | null {
  const record = read();
  return record && matches(recoverySessionIdentity(session), record) ? record.phase : null;
}

export function rememberRecoverySession(session: RecoveryAuthSession): void {
  activeIdentity = recoverySessionIdentity(session);
  if (activeIdentity) write({ ...activeIdentity, phase: "unfinished" });
}

export function activeRecoverySessionId(userId: string): string | null {
  return activeIdentity?.userId === userId ? activeIdentity.sessionId : null;
}

/** Only a successful password update completes the same confirmed session. */
export function completeRememberedRecovery(userId: string | null): void {
  if (!activeIdentity || activeIdentity.userId !== userId) return;
  // Another tab may have begun a different recovery. Never complete that one.
  if (matches(activeIdentity, read())) write({ ...activeIdentity, phase: "completed" });
}

export function resetRecoveryPersistenceForTests(): void {
  activeIdentity = null;
  memoryRecord = null;
}

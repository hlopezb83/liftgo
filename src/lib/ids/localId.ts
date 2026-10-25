let sequence = 0;

/**
 * IDs for local drafts and diagnostic correlation only — never credentials,
 * authorization tokens, public sharing links or other security boundaries.
 * Older/insecure browser contexts may expose getRandomValues but not randomUUID.
 */
export function createLocalId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch { /* Optional browser capability; try the older API. */ }
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch { /* Restricted runtimes must not break auth or error feedback. */ }
  // Sequence keeps repeated calls distinct even with a frozen clock/randomness.
  // Randomness reduces collisions between tabs; this is deliberately NOT a UUID
  // or a cryptographic token when the platform provides no secure randomness.
  sequence += 1;
  return `local-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

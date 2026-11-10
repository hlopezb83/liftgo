/** Activation is a reviewed source change, never a query parameter or secret. */
export interface PreviewWindow {
  enabled: boolean;
  shutdown: boolean;
  runId: string;
  startsAt: number;
  expiresAt: number;
}
export const MAX_TTL_MS = 2 * 60 * 60 * 1000;
export const PREVIEW_WINDOW: Readonly<PreviewWindow> = Object.freeze({
  enabled: false,
  shutdown: true,
  runId: "fx6-preview-review-pending",
  startsAt: 0,
  expiresAt: 0,
});
export const PREVIEW_ORIGINS = [
  "http://localhost:8080",
  "https://id-preview--e25ace4a-172e-4082-a037-00473dacf2f2.lovable.app",
] as const;
export function windowOpen(window: PreviewWindow, now: number): boolean {
  return window.enabled === true && window.shutdown === false &&
    window.runId.length > 0 && Number.isFinite(now) &&
    Number.isFinite(window.startsAt) && Number.isFinite(window.expiresAt) &&
    window.expiresAt > window.startsAt &&
    window.expiresAt - window.startsAt <= MAX_TTL_MS &&
    now >= window.startsAt && now < window.expiresAt;
}
export interface PreflightResult {
  ok: boolean;
  status: number;
  code: "disabled" | "preview_only" | "unauthorized" | "forbidden" |
    "configuration_rejected" | "expired" | "issuer_mismatch" | "unavailable" | "verified";
  issuerMatches?: boolean;
  sandboxConfirmed?: boolean;
}

import {
  checkTestKey, compareIssuer, TENANT_ORGANIZATION_ID,
} from "../../../../qa/facturapi6-sandbox-candidate/runner/policy";
import { MAX_TTL_MS, PREVIEW_ORIGINS, windowOpen, type PreviewWindow, type PreflightResult } from "./policy";

// Only structural read capabilities are exposed to this preflight.
export interface ReadResult { data: unknown; error: unknown }
export interface ReadQuery extends PromiseLike<ReadResult> {
  select(columns: string): ReadQuery;
  eq(column: string, value: unknown): ReadQuery;
  neq(column: string, value: unknown): ReadQuery;
  limit(count: number): ReadQuery;
}
export interface ReadDb { from(table: string): ReadQuery }
export interface Caller extends ReadDb {
  auth: {
    getClaims(token: string): Promise<{ data: { claims?: unknown } | null; error: unknown }>;
    getUser(token: string): Promise<{ data: { user: { id?: string } | null } | null; error: unknown }>;
  };
  rpc(name: "has_role", args: { _user_id: string; _role: "admin" }): PromiseLike<ReadResult>;
}
export interface PreflightDeps {
  now(): number;
  window: PreviewWindow;
  development: boolean;
  origin: string;
  token: string;
  caller: Caller;
  loadSecretReader(): Promise<ReadDb>;
  readIssuer(key: string, signal: AbortSignal): Promise<unknown>;
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const denied = (status: number, code: PreflightResult["code"]): PreflightResult => ({ ok: false, status, code });
function rows(result: ReadResult): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data) || !result.data.every(record)) throw new Error("read_failed");
  return result.data;
}

async function authorized(deps: PreflightDeps): Promise<boolean> {
  const claimsResult = await deps.caller.auth.getClaims(deps.token);
  const claims = claimsResult.data?.claims;
  if (claimsResult.error || !record(claims) || claims.role !== "authenticated" ||
    !uuid(claims.sub) || !uuid(claims.session_id)) return false;
  const user = await deps.caller.auth.getUser(deps.token);
  if (user.error || user.data?.user?.id !== claims.sub) return false;
  const profiles = rows(await deps.caller.from("profiles").select("user_id,is_active")
    .eq("user_id", claims.sub).limit(2));
  if (profiles.length !== 1 || profiles[0]?.user_id !== claims.sub || profiles[0]?.is_active !== true) return false;
  const role = await deps.caller.rpc("has_role", { _user_id: claims.sub, _role: "admin" });
  if (role.error || role.data !== true) return false;
  const memberships = rows(await deps.caller.from("organization_memberships")
    .select("organization_id,member_type").eq("auth_user_id", claims.sub).limit(2));
  if (memberships.length !== 1 || memberships[0]?.member_type !== "internal" ||
    memberships[0]?.organization_id !== TENANT_ORGANIZATION_ID) return false;
  const orgs = rows(await deps.caller.from("organizations").select("id,is_active")
    .eq("id", TENANT_ORGANIZATION_ID).limit(2));
  return orgs.length === 1 && orgs[0]?.id === TENANT_ORGANIZATION_ID && orgs[0]?.is_active === true;
}

async function readConfiguration(deps: PreflightDeps) {
  const settings = rows(await deps.caller.from("company_settings")
    .select("facturapi_mode,razon_social,rfc").eq("organization_id", TENANT_ORGANIZATION_ID).limit(2));
  const setting = settings[0];
  if (settings.length !== 1 || setting?.facturapi_mode !== "test") return null;
  // Privileged reader is loaded ONLY after real session, admin, membership,
  // active organization and explicit test mode; no live column or env fallback.
  if (!windowOpen(deps.window, deps.now())) return null;
  const reader = await deps.loadSecretReader();
  const secrets = rows(await reader.from("billing_secrets").select("facturapi_test_key")
    .eq("organization_id", TENANT_ORGANIZATION_ID).limit(2));
  const key = secrets[0]?.facturapi_test_key;
  if (secrets.length !== 1 || typeof key !== "string" || key === "sk_test_" ||
    !checkTestKey("test", key, false).ok) return null;
  // Existence only. No IDs or keys of other owners are returned or retained.
  const others = rows(await reader.from("billing_secrets").select("organization_id")
    .neq("organization_id", TENANT_ORGANIZATION_ID).eq("facturapi_test_key", key).limit(1));
  return others.length === 0 ? { setting, key } : null;
}

async function checkIssuer(deps: PreflightDeps, config: NonNullable<Awaited<ReturnType<typeof readConfiguration>>>): Promise<PreflightResult> {
  const now = deps.now();
  if (!windowOpen(deps.window, now)) return denied(410, "expired");
  const remaining = deps.window.expiresAt - now;
  const timeout = Math.min(14_900, remaining);
  if (timeout <= 0 || timeout > MAX_TTL_MS) return denied(410, "expired");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    if (!windowOpen(deps.window, deps.now())) controller.abort();
    controller.signal.throwIfAborted();
    const me = await deps.readIssuer(config.key, controller.signal);
    if (controller.signal.aborted || !windowOpen(deps.window, deps.now())) return denied(410, "expired");
    const legal = record(me) && record(me.legal) ? me.legal : {};
    const matches = compareIssuer({ providerLegalName: legal.legal_name, providerTaxId: legal.tax_id,
      erpRazonSocial: config.setting.razon_social, erpRfc: config.setting.rfc });
    const ok = matches.legalNameMatches && matches.taxIdMatches;
    return { ok, status: ok ? 200 : 409, code: ok ? "verified" : "issuer_mismatch",
      issuerMatches: ok, sandboxConfirmed: true };
  } finally { clearTimeout(timer); }
}

export async function runReadOnlyPreflight(deps: PreflightDeps): Promise<PreflightResult> {
  if (!deps.window.enabled || deps.window.shutdown) return denied(423, "disabled");
  if (!deps.development || !PREVIEW_ORIGINS.some(origin => origin === deps.origin)) return denied(403, "preview_only");
  if (!windowOpen(deps.window, deps.now())) return denied(410, "expired");
  if (!deps.token) return denied(401, "unauthorized");
  try {
    if (!await authorized(deps)) return denied(401, "unauthorized");
    const config = await readConfiguration(deps);
    if (!config) return denied(409, "configuration_rejected");
    return await checkIssuer(deps, config);
  } catch {
    // No raw provider/auth/DB exceptions escape into global error reporting.
    return denied(503, "unavailable");
  }
}

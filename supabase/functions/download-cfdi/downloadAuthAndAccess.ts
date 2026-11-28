import { getCorsHeaders } from "../_shared/cors.ts";
import { jsonError } from "../_shared/http.ts";
import {
  assertDocumentOrganization,
  resolveDocumentOrganization,
  resolvePortalAccess,
} from "../_shared/orgContext.ts";
import type { SupabaseLike } from "../_shared/types.ts";

export interface DownloadSupabaseLike extends Omit<SupabaseLike, "storage"> {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Blob | Uint8Array,
        opts?: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
      download: (
        path: string,
      ) => Promise<{ data: Blob | null; error: unknown }>;
    };
  };
}

export interface DownloadCfdiDeps {
  createCallerClient: () => SupabaseLike;
  createServiceClient: () => DownloadSupabaseLike;
  fetchImpl: typeof fetch;
  env: (key: string) => string | undefined;
}

export interface PortalAccess {
  organizationId: string;
  customerId: string;
}

export type DlFormat = "xml" | "pdf" | "acuse_xml" | "acuse_pdf";
export type BaseFormat = "xml" | "pdf";

const ALLOWED_ROLES = [
  "admin",
  "administrativo",
  "ventas",
  "auditor",
  "customer",
];

export async function authenticateDownload(
  req: Request,
  deps: DownloadCfdiDeps,
): Promise<
  | { ok: true; userId: string; role: string; supabase: DownloadSupabaseLike }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }
  const callerClient = deps.createCallerClient();
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await callerClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }
  const supabase = deps.createServiceClient();
  const userId = data.claims.sub as string;

  const profileRes = await supabase
    .from("profiles")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  const profileErr = (profileRes as { error: unknown }).error;
  if (profileErr) {
    console.error(
      "[auth] profiles lookup failed, fail-closed:",
      (profileErr as { message?: string })?.message,
    );
    return {
      ok: false,
      response: jsonError(
        req,
        503,
        "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos.",
      ),
    };
  }
  const profile = (profileRes as { data: unknown }).data as
    | { is_active: boolean | null }
    | null;
  if (profile && profile.is_active === false) {
    return { ok: false, response: jsonError(req, 403, "Cuenta desactivada") };
  }

  const roleRes = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ALLOWED_ROLES)
    .maybeSingle();
  const roleData = (roleRes as { data: unknown }).data as
    | { role: string }
    | null;
  if (!roleData) {
    return {
      ok: false,
      response: jsonError(req, 403, "Forbidden: insufficient role"),
    };
  }

  return { ok: true, userId, role: roleData.role, supabase };
}

export async function enforceRateLimitWithDeps(
  req: Request,
  supabase: DownloadSupabaseLike,
  bucket: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<Response | null> {
  const res = await supabase.rpc?.("check_and_record_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max_requests: maxRequests,
    _window_seconds: windowSeconds,
  });
  const error = res?.error;
  if (error) {
    console.error(
      `[rateLimit:${bucket}] RPC error, fail-closed:`,
      (error as { message?: string })?.message,
    );
    return new Response(
      JSON.stringify({
        error:
          "Servicio de control de acceso no disponible. Reintenta en unos segundos.",
      }),
      {
        status: 503,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      },
    );
  }
  if (res?.data === false) {
    return new Response(
      JSON.stringify({
        error:
          `Demasiadas peticiones. Espera unos segundos antes de reintentar (límite ${maxRequests}/${windowSeconds}s).`,
      }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Retry-After": String(windowSeconds),
        },
      },
    );
  }
  return null;
}

export async function resolvePortalForRole(
  req: Request,
  supabase: DownloadSupabaseLike,
  role: string,
  userId: string,
): Promise<
  { ok: true; portal: PortalAccess | null } | { ok: false; response: Response }
> {
  if (role !== "customer") return { ok: true, portal: null };
  const access = await resolvePortalAccess(supabase, userId);
  if (!access.ok) {
    return {
      ok: false,
      response: jsonError(req, access.status, access.message),
    };
  }
  return {
    ok: true,
    portal: {
      organizationId: access.organizationId,
      customerId: access.customerId,
    },
  };
}

export function requireCustomerOwnership(
  req: Request,
  portal: PortalAccess | null,
  customerId: unknown,
): Response | null {
  if (!portal) return null;
  if (!customerId || portal.customerId !== customerId) {
    return jsonError(req, 403, "Forbidden: not the owner of this document");
  }
  return null;
}

export async function checkDocumentOrganization(
  req: Request,
  supabase: DownloadSupabaseLike,
  userId: string,
  documentOrganizationId: unknown,
  portal: PortalAccess | null,
): Promise<
  { ok: true; organizationId: string } | { ok: false; response: Response }
> {
  const docOrg = documentOrganizationId as string | null | undefined;
  const orgCheck = portal
    ? assertDocumentOrganization({
      callerOrganizationId: portal.organizationId,
      documentOrganizationId: docOrg,
    })
    : await resolveDocumentOrganization({
      admin: supabase,
      userId,
      isServiceRole: false,
      documentOrganizationId: docOrg,
    });
  if (!orgCheck.ok) {
    return {
      ok: false,
      response: jsonError(req, orgCheck.status, orgCheck.message),
    };
  }
  return { ok: true, organizationId: orgCheck.organizationId };
}

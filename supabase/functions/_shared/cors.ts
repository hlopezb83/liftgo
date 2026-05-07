// Allowlist explícita. Para agregar dominios sin redeploy, configurar el secret
// ALLOWED_ORIGINS como CSV (ej: "https://foo.com,https://bar.com").
const STATIC_ALLOWED_ORIGINS = [
  "https://liftgo.lovable.app",
  "https://id-preview--e25ace4a-172e-4082-a037-00473dacf2f2.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

const envOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([...STATIC_ALLOWED_ORIGINS, ...envOrigins]);

// Sandbox/preview de Lovable usa subdominios efímeros con el project id.
// Permitimos exclusivamente los que contengan nuestro project id.
const PROJECT_ID = "e25ace4a-172e-4082-a037-00473dacf2f2";
const PREVIEW_REGEX = new RegExp(
  `^https:\\/\\/[a-z0-9-]*${PROJECT_ID}[a-z0-9.-]*\\.lovable(project)?\\.(app|com)$`,
);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (PREVIEW_REGEX.test(origin)) return true;
  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}

// Helpers compartidos para tests Deno de Edge Functions.
// Resolución del URL del proyecto Supabase para los smoke tests:
//   1. SUPABASE_URL (estándar en CI/runtime Deno)
//   2. VITE_SUPABASE_URL (fallback durante desarrollo local)
//   3. http://localhost:54321 (Supabase CLI local) — fallback final SEGURO.
//
// Nota: NUNCA usar la URL pública de producción como fallback. Si los tests
// se ejecutan sin env vars, deben correr contra Supabase local — jamás
// golpear producción real por accidente.
//
// IMPORTANTE: usamos `||` (no `??`) para que strings vacíos también caigan al
// fallback. En CI, un secret no configurado se inyecta como "" y el operador
// `??` no lo detecta, generando URLs relativas inválidas (`/functions/v1/...`).
const rawUrl = (Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("VITE_SUPABASE_URL") ||
  "").trim();

export const SUPABASE_URL = rawUrl || "http://localhost:54321";

// Validación temprana: si SUPABASE_URL no es absoluta, fallamos con mensaje claro
// en lugar de propagar `TypeError: Invalid URL` en cada test individual.
try {
  // eslint-disable-next-line no-new
  new URL(SUPABASE_URL);
} catch {
  throw new Error(
    `[test-helpers] SUPABASE_URL inválido: "${SUPABASE_URL}". ` +
      `Configura el secret VITE_SUPABASE_URL en GitHub Actions ` +
      `(Settings → Secrets and variables → Actions) o exporta SUPABASE_URL localmente.`,
  );
}

export const fnUrl = (name: string): string =>
  `${SUPABASE_URL}/functions/v1/${name}`;

/**
 * `fetch` con reintentos para los smoke tests.
 *
 * Los edge functions arrancan en frío: la primera petición del día puede
 * devolver 502/503/504 del gateway antes de que el worker esté listo. Eso
 * hacía fallar tests que sólo verifican contratos (CORS, 401 sin token).
 * Reintentamos únicamente ante errores de gateway/red — nunca ante respuestas
 * legítimas del function (4xx, 500 propio).
 */
const GATEWAY_STATUSES = new Set([502, 503, 504, 522, 524]);

export async function fetchFn(
  input: string | URL,
  init?: RequestInit,
  attempts = 4,
): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      if (!GATEWAY_STATUSES.has(res.status) || i === attempts - 1) return res;
      await res.text(); // evita fuga de recursos en Deno
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastError instanceof Error ? lastError : new Error("fetchFn failed");
}

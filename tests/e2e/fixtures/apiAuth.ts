import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Session } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

/**
 * Autenticación E2E por API (Fase 4 de la auditoría de tests).
 *
 * Antes el `global.setup.ts` se logueaba por UI: abría `/`, llenaba el form y
 * esperaba el redirect. Eso ataba el arranque de TODA la suite a la salud del
 * componente de login (~15s por rol, y cascada total si cambiaba un selector).
 *
 * Ahora pedimos la sesión directamente a Supabase y escribimos el
 * `storageState` de Playwright a mano. La UI de login sigue cubierta por
 * `roles-matrix` (que ya no la usa) y por los specs del portal.
 */

export type StorageState = {
  cookies: never[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/** Lee una env var, con fallback al `.env` del repo (no cargado por Playwright). */
function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      if (line.slice(0, idx).trim() !== name) continue;
      return line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env ausente en CI — se espera que las env vars estén inyectadas.
  }
  return undefined;
}

export function supabaseEnv(): { url: string; anonKey: string; storageKey: string } {
  const url = envVar("VITE_SUPABASE_URL");
  const anonKey = envVar("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) {
    throw new Error(
      "[e2e] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY para el login por API.",
    );
  }
  const ref = new URL(url).hostname.split(".")[0];
  return { url, anonKey, storageKey: `sb-${ref}-auth-token` };
}

/** Login por API. Falla loud (throw) si las credenciales no sirven. */
export async function signInViaApi(email: string, password: string): Promise<Session> {
  const { url, anonKey } = supabaseEnv();
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(
      `[e2e] Login por API falló para ${email}: ${error?.message ?? "sin sesión en la respuesta"}`,
    );
  }
  return data.session;
}

/**
 * Construye el `storageState` de Playwright a partir de una sesión Supabase.
 * Incluye la bandera `liftgo:e2e-visible` para que las listas no filtren las
 * filas sembradas con `is_e2e = true`.
 */
export function buildStorageState(session: Session, baseURL: string): StorageState {
  const { storageKey } = supabaseEnv();
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          { name: storageKey, value: JSON.stringify(session) },
          { name: "liftgo:e2e-visible", value: "1" },
        ],
      },
    ],
  };
}

/** Verifica que el usuario NO sea del portal de clientes (debe ser staff). */
export async function assertIsStaffUser(session: Session, email: string): Promise<void> {
  const { url, anonKey } = supabaseEnv();
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id);
  if (error) {
    throw new Error(`[e2e] No se pudieron leer los roles de ${email}: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `[e2e] ${email} no tiene filas en public.user_roles — probablemente es una cuenta del ` +
        "Portal de Clientes. Usa una cuenta de staff (rol 'admin').",
    );
  }
}

/**
 * Escribe (y cachea en disco) el `storageState` de un rol.
 * Reutiliza el archivo si la sesión cacheada aún no expiró — así
 * `roles-matrix.spec.ts` no re-autentica en cada corrida.
 */
export async function ensureRoleStorageState(
  roleKey: string,
  email: string,
  password: string,
  baseURL: string,
): Promise<string> {
  const path = `tests/e2e/.auth/${roleKey}.json`;
  if (existsSync(path)) {
    try {
      const cached = JSON.parse(readFileSync(path, "utf8")) as StorageState;
      const raw = cached.origins[0]?.localStorage.find((e) => e.name.startsWith("sb-"))?.value;
      const session = raw ? (JSON.parse(raw) as Session) : null;
      // Margen de 5 min para no usar un token que caduque a mitad del test.
      if (session?.expires_at && session.expires_at * 1000 - Date.now() > 5 * 60_000) {
        return path;
      }
    } catch {
      // cache corrupto → re-autenticamos
    }
  }

  const session = await signInViaApi(email, password);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(buildStorageState(session, baseURL), null, 2));
  return path;
}

/**
 * Inyecta una sesión (login por API) en el navegador ya abierto. Usado por
 * specs que necesitan cambiar de rol en caliente sin pasar por el form.
 */
export async function applyApiSession(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const { storageKey } = supabaseEnv();
  const session = await signInViaApi(email, password);
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("liftgo:e2e-visible", "1");
    },
    [storageKey, JSON.stringify(session)] as const,
  );
}

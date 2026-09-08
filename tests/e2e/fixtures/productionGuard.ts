/**
 * Guard fail-closed: las pruebas E2E escriben en la base (seed, purge,
 * company_settings.allow_e2e_seed). NUNCA deben apuntar al backend productivo.
 *
 * Reglas (todas obligatorias, se evalúan ANTES de login/seed/teardown):
 *   1. El destino debe estar configurado. Sin URL → error, no "modo silencioso".
 *   2. El ref del proyecto productivo conocido está en lista negra explícita,
 *      aunque alguien lo pase por otra variable o por .env local.
 *   3. Hay que declarar el entorno aislado con E2E_ISOLATED_BACKEND=1. No basta
 *      con que el frontend sea localhost: el frontend local puede hablar con
 *      producción.
 *   4. El host debe ser local/efímero (loopback o *.internal). Un backend
 *      remoto aislado exige además E2E_ALLOW_REMOTE_BACKEND=1, y aun así la
 *      lista negra manda.
 *
 * Se comprueban tanto las variables del cliente (VITE_*) como las del servidor
 * (SUPABASE_*): el build del navegador y el proceso de pruebas pueden apuntar a
 * proyectos distintos.
 */

import { readFileSync } from "node:fs";

/** Ref del proyecto PRODUCTIVO. Confirmado por el usuario: no es staging. */
export const PRODUCTION_PROJECT_REFS = ["zxefrzfaynnfwazqhwxp"] as const;


const TARGET_ENV_VARS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_ID",
  "E2E_SUPABASE_URL",
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"]);

/** Ficheros que `apiAuth.envVar()` usa como fallback y que el guard debe auditar. */
const DOTENV_FILES = [".env", ".env.local"] as const;

function readDotenv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return out; // Ausente en CI: se esperan env vars inyectadas.
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Destinos efectivos: env vars del proceso MÁS el `.env` del repo. El fallback a
 * `.env` existe en `apiAuth.envVar()`, así que sin auditarlo aquí un `.env` con
 * la URL productiva pasaba el guard y luego se usaba para conectarse.
 */
export function collectConfiguredTargets(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  for (const name of TARGET_ENV_VARS) {
    const value = process.env[name];
    if (value) out.push([name, value] as const);
  }
  for (const file of DOTENV_FILES) {
    const parsed = readDotenv(file);
    for (const name of TARGET_ENV_VARS) {
      if (process.env[name]) continue; // La env var explícita gana; ya auditada arriba.
      const value = parsed[name];
      if (value) out.push([`${name} (${file})`, value] as const);
    }
  }
  return out;
}

function forbiddenRefs(): string[] {
  const extra = (process.env.E2E_FORBIDDEN_PROJECT_REFS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...PRODUCTION_PROJECT_REFS, ...extra];
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith(".local") || h.endsWith(".internal");
}


function fail(context: string, reason: string): never {
  throw new Error(
    `[e2e][guard] BLOQUEADO antes de "${context}": ${reason}\n` +
      "Las pruebas E2E escriben en la base. Usa el Supabase LOCAL efímero del runner " +
      "(misma infraestructura que rls-db-tests) y exporta E2E_ISOLATED_BACKEND=1 " +
      "junto con VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY apuntando a ese backend. " +
      "Si no existe entorno aislado, el job debe reportar la precondición faltante: " +
      "NO se debe correr contra producción.",
  );
}

/**
 * Aborta si el destino configurado puede ser producción. Llamar en TODOS los
 * puntos de entrada con escritura, antes de cualquier petición.
 */
export function assertNonProductionBackend(context: string): void {
  const configured = collectConfiguredTargets();

  // 2. Lista negra explícita del ref productivo (antes que cualquier otra cosa).
  const refs = forbiddenRefs();
  for (const [name, value] of configured) {
    const lowered = value.toLowerCase();
    const hit = refs.find((ref) => lowered.includes(ref));
    if (hit) {
      fail(context, `${name} apunta al proyecto productivo bloqueado (ref "${hit}").`);
    }
  }

  // 1. Destino obligatorio.
  const urls = configured.filter(([name]) => name.split(" ")[0].endsWith("_URL"));

  if (urls.length === 0) {
    fail(context, "no hay ninguna URL de Supabase configurada para las pruebas.");
  }

  // 3. Declaración explícita del entorno aislado.
  if (process.env.E2E_ISOLATED_BACKEND !== "1") {
    fail(context, "falta E2E_ISOLATED_BACKEND=1 (declaración explícita de backend aislado).");
  }

  // 4. Host local, salvo escape explícito.
  const allowRemote = process.env.E2E_ALLOW_REMOTE_BACKEND === "1";
  for (const [name, value] of urls) {
    let hostname: string;
    try {
      hostname = new URL(value).hostname;
    } catch {
      fail(context, `${name} no es una URL válida.`);
    }
    if (!isLocalHostname(hostname) && !allowRemote) {
      fail(
        context,
        `${name} apunta a un host remoto (${hostname}) sin E2E_ALLOW_REMOTE_BACKEND=1.`,
      );
    }
  }
}

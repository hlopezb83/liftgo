/**
 * Guards fail-closed del verificador de restore.
 *
 * Nada de esto conecta a ninguna base: son comprobaciones puras que se ejecutan
 * ANTES de abrir la conexión. Cualquier duda aborta.
 */

/** Ref productivo bloqueado. Nunca puede aparecer en la URL ni en el ref esperado. */
export const BLOCKED_PRODUCTION_REF = "zxefrzfaynnfwazqhwxp";

/** Nombre de la variable de entorno única que puede traer la conexión. */
export const DATABASE_URL_ENV = "RESTORE_REHEARSAL_DATABASE_URL";

/** Nombre de la variable con el ref/host esperado de la instancia aislada. */
export const EXPECTED_REF_ENV = "RESTORE_REHEARSAL_EXPECTED_REF";

const REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;

/** Placeholder con el que se sustituye cualquier DSN en logs y reportes. */
export const MASKED_DSN = "postgresql://***:***@***/***";

/** Reemplaza cualquier DSN o secreto conocido por un placeholder. */
export function maskSecrets(text: string, secrets: readonly string[] = []): string {
  let out = String(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***");
  }
  // Cualquier DSN tipo postgres(ql)://user:pass@host/db que haya sobrevivido.
  out = out.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, MASKED_DSN);
  return out;
}

/** Convierte un error desconocido en un mensaje sin URL ni credenciales. */
export function sanitizeError(error: unknown, secrets: readonly string[] = []): string {
  const raw = error instanceof Error ? error.message : String(error);
  return maskSecrets(raw, secrets);
}

export interface TargetInput {
  databaseUrl: string | undefined;
  expectedRef: string | undefined;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/**
 * Valida que la conexión apunte a la instancia aislada esperada.
 * Lanza un Error con mensaje ya enmascarado si algo no cuadra.
 */
export function assertSafeTarget({ databaseUrl, expectedRef }: TargetInput): {
  expectedRef: string;
  host: string;
} {
  const url = (databaseUrl ?? "").trim();
  const ref = (expectedRef ?? "").trim();

  if (!url) {
    throw new Error(`Falta ${DATABASE_URL_ENV}: el verificador no recibe la conexión por ningún otro medio.`);
  }
  // Bloqueo del ref productivo ANTES de parsear o conectar.
  if (url.includes(BLOCKED_PRODUCTION_REF)) {
    throw new Error("La conexión apunta al ref productivo bloqueado. Abortado sin conectar.");
  }
  if (!ref) {
    throw new Error(`Falta ${EXPECTED_REF_ENV}: el ref/host esperado de la instancia aislada es obligatorio.`);
  }
  if (ref.includes(BLOCKED_PRODUCTION_REF)) {
    throw new Error("El ref esperado es el productivo bloqueado. Abortado sin conectar.");
  }
  if (!REF_PATTERN.test(ref)) {
    throw new Error("El ref esperado tiene un formato inválido (3-64 caracteres alfanuméricos, '.', '-' o '_').");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("La conexión no es una URL válida.");
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error("La conexión debe usar el esquema postgres:// o postgresql://.");
  }

  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, "");
  const user = parsed.username;

  const matchesRef = [host, database, user].some((part) => part.toLowerCase().includes(ref.toLowerCase()));
  // Una instancia local/efímera (docker, sandbox) no lleva el ref en el host:
  // sólo se acepta si el ref esperado se declara explícitamente como local.
  const localAllowed = isLoopbackHost(host) && /^local/i.test(ref);

  if (!matchesRef && !localAllowed) {
    throw new Error("La conexión no corresponde al ref/host esperado. Abortado sin conectar.");
  }

  return { expectedRef: ref, host: localAllowed ? host : maskHost(host) };
}

/** Enmascara un host dejando sólo su sufijo de dominio, sin exponer el ref. */
export function maskHost(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return "***";
  return `***.${parts.slice(-2).join(".")}`;
}

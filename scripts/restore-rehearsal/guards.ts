/** Guards fail-closed que corren antes de abrir la conexion. */
export const BLOCKED_PRODUCTION_REF = "zxefrzfaynnfwazqhwxp";
export const DATABASE_URL_ENV = "RESTORE_REHEARSAL_DATABASE_URL";
export const EXPECTED_REF_ENV = "RESTORE_REHEARSAL_EXPECTED_REF";
export const MASKED_DSN = "postgresql://***:***@***/***";
const REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;

export function maskSecrets(text: string, secrets: readonly string[] = []): string {
  let result = String(text);
  for (const secret of secrets) {
    if (secret.length >= 4) result = result.replaceAll(secret, "***");
  }
  return result.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, MASKED_DSN);
}

export function sanitizeError(error: unknown, secrets: readonly string[] = []): string {
  return maskSecrets(error instanceof Error ? error.message : String(error), secrets);
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

export function assertSafeTarget(input: { databaseUrl?: string; expectedRef?: string }): void {
  const databaseUrl = (input.databaseUrl ?? "").trim();
  const expectedRef = (input.expectedRef ?? "").trim();
  if (!databaseUrl) throw new Error(`Falta ${DATABASE_URL_ENV}.`);
  if (!expectedRef) throw new Error(`Falta ${EXPECTED_REF_ENV}.`);
  if (!REF_PATTERN.test(expectedRef)) throw new Error("El ref esperado tiene formato invalido.");
  if (expectedRef.toLowerCase().includes(BLOCKED_PRODUCTION_REF)) {
    throw new Error("El destino esperado es el productivo bloqueado. Abortado sin conectar.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("La conexion no es una URL valida.");
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) throw new Error("La conexion debe usar postgres:// o postgresql://.");
  const comparableUrl = decodeURIComponent(databaseUrl).toLowerCase();
  if (comparableUrl.includes(BLOCKED_PRODUCTION_REF) || parsed.hostname.toLowerCase().includes(BLOCKED_PRODUCTION_REF)) {
    throw new Error("La conexion apunta al productivo bloqueado. Abortado sin conectar.");
  }

  const ref = expectedRef.toLowerCase();
  const matches = [parsed.hostname, parsed.username, parsed.pathname].some((part) => part.toLowerCase().includes(ref));
  const localAllowed = isLoopback(parsed.hostname) && ref.startsWith("local");
  if (!matches && !localAllowed) throw new Error("La conexion no corresponde al destino esperado. Abortado sin conectar.");
}


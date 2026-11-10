/** Preparación offline: ninguna implementación de clientes, secretos o red. */
export const TENANT = "fc2c10e3-278b-4899-8aa1-f802752f1c38";
export const EXCLUSIVITY_RPC = "qa_fx6_elogistix_test_key_is_exclusive";
export class QaConfigError extends Error {
  constructor(readonly code: "config_read_error" | "config_invalid_mode" | "config_invalid_key_mode" | "config_duplicate_key" | "organization_required") {
    super("Configuración QA no disponible; ejecución bloqueada.");
  }
}
export interface QaConfigScope {
  /** El futuro boundary debe comprobar sesión, admin activo, pertenencia y ventana. */
  checkpoint(): void;
  loadVerifier(): Promise<() => Promise<boolean>>;
}
type Query = {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
};
export interface ConfigReader { from(table: string): Query }
const scopes = new WeakMap<object, QaConfigScope>();

/** Por cliente/solicitud, nunca variable global de fetch, console o credenciales. */
export function attachOfflineConfigScope(client: object, scope: QaConfigScope): () => void {
  if (scopes.has(client)) throw new QaConfigError("config_read_error");
  scopes.set(client, scope);
  return () => { scopes.delete(client); };
}

export async function readQaTestConfig(input: {
  admin: ConfigReader;
  organizationId: string | null | undefined;
  modeOverride?: string | null;
}) {
  if (input.organizationId !== TENANT) throw new QaConfigError("organization_required");
  const scope = scopes.get(input.admin);
  if (!scope) throw new QaConfigError("config_read_error");
  scope.checkpoint();
  // Siempre releer el modo: un override no acredita el modo actual del tenant.
  if (input.modeOverride !== undefined && input.modeOverride !== "test") {
    throw new QaConfigError("config_invalid_mode");
  }
  const mode = await input.admin.from("company_settings").select("facturapi_mode")
    .eq("organization_id", TENANT).maybeSingle();
  scope.checkpoint();
  if (mode.error || mode.data?.facturapi_mode !== "test") {
    throw new QaConfigError(mode.error ? "config_read_error" : "config_invalid_mode");
  }
  const verify = await scope.loadVerifier();
  scope.checkpoint();
  const exclusive = await verify();
  scope.checkpoint();
  if (exclusive !== true) throw new QaConfigError("config_duplicate_key");
  const secret = await input.admin.from("billing_secrets").select("facturapi_test_key")
    .eq("organization_id", TENANT).maybeSingle();
  scope.checkpoint();
  if (secret.error) throw new QaConfigError("config_read_error");
  const key = secret.data?.facturapi_test_key;
  if (typeof key !== "string" || !key.startsWith("sk_test_") || key.length <= 8) {
    throw new QaConfigError("config_invalid_key_mode");
  }
  // Sólo retorno interno al handler, nunca al DTO de una función pública.
  return { mode: "test" as const, apiKey: key, organizationId: TENANT, fromEnvFallback: false };
}
import { join } from "node:path";

/**
 * Configuración y excepciones del detector de aislamiento por organización.
 * Separado de la prueba para mantener cada archivo por debajo del límite de
 * longitud; el contenido es el mismo y no relaja ninguna afirmación.
 */
export const ROOT = process.cwd();
export const TYPES_FILE = join(
  ROOT,
  "src",
  "integrations",
  "supabase",
  "types.ts",
);

export const SERVER_DIRS = [
  join(ROOT, "src", "lib"),
  join(ROOT, "src", "lib", "server"),
  join(ROOT, "src", "routes", "api"),
  join(ROOT, "src", "integrations", "supabase"),
];

/** Nombres con los que se referencia al cliente service_role. */
export const PRIVILEGED_RECEIVERS = ["admin", "supabaseAdmin", "adminClient"];

/**
 * Excepciones explícitas: operaciones privilegiadas sobre tablas con empresa
 * cuyo alcance NO puede expresarse como filtro de empresa en la propia
 * consulta. Cada entrada exige el patrón exacto de la operación y su
 * justificación; cualquier otra consulta sobre la misma tabla sigue fallando.
 */
export interface AllowEntry {
  file: string;
  table: string;
  match: RegExp;
  reason: string;
}

export const ALLOWLIST: AllowEntry[] = [
  {
    file: "src/lib/userAdmin.helpers.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación tras borrar la cuenta de autenticación recién creada: la clave es la identidad, no la empresa.",
  },
  {
    file: "src/lib/userAdmin.functions.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "deleteUserFn valida antes assertTargetInOrganization y después elimina la cuenta completa.",
  },
  {
    file: "src/lib/platformAdmin.helpers.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación del alta de empresa (operador de plataforma) sobre el usuario que acaba de crearse.",
  },
  {
    file: "src/lib/customerPortal.link.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación de la invitación al portal sobre el usuario recién creado.",
  },
  {
    file: "src/lib/customerPortal.link.ts",
    table: "customer_portal_accounts",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación de la invitación al portal sobre el usuario recién creado.",
  },
  {
    file: "src/lib/customerPortal.helpers.ts",
    table: "customer_portal_accounts",
    match: /\.select\(\s*"id"\s*\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Existencia del vínculo legado por identidad: sólo devuelve id y decide si manda la cuenta con empresa.",
  },
  {
    file: "src/lib/customerPortal.helpers.ts",
    table: "organization_memberships",
    match: /\.select\(\s*"organization_id"\s*\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Lectura que DERIVA la empresa del vínculo legado; el resultado se compara contra la empresa del staff.",
  },
];

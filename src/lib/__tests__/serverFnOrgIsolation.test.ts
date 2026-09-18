import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresión multiempresa (tramo 13).
 *
 * `supabaseAdmin` (service_role) NO aplica RLS: cada consulta hecha con él sobre
 * una tabla que tiene `organization_id` debe acotar la empresa EN ESA MISMA
 * operación. La versión anterior de esta prueba sólo miraba si el archivo
 * mencionaba `requireInternalOrganization` en algún lugar y usaba una lista de
 * tablas escrita a mano; ambas cosas eran insuficientes.
 *
 * Ahora:
 *  - el conjunto de tablas con empresa se deriva de los tipos generados de la
 *    base, no de una lista parcial;
 *  - se extrae la cadena completa de cada `.from()` privilegiado y se exige el
 *    filtro/columna de empresa en esa operación concreta;
 *  - se recorren todos los directorios de servidor, no sólo `*.functions.ts`.
 *
 * Cobertura declarada: código TypeScript del servidor en `src/lib`,
 * `src/lib/server`, `src/routes/api` (si existe) y `src/integrations/supabase`.
 * Las Edge Functions de Supabase están en Deno y se cubren aparte
 * (`supabase/functions/_shared/retiredEndpointSources_test.ts`), salvo la
 * comprobación de retiro que se replica aquí abajo.
 *
 * NO cubierto por este detector (revisión manual documentada en el roadmap):
 *  - llamadas `rpc(...)` con `p_organization_id`: hoy sólo
 *    `platformAdmin.functions.ts` pasa una empresa del input, detrás de
 *    `requirePlatformOperator` y con la autorización repetida dentro de la
 *    función SQL (`platform_set_organization_active`, `platform_*`);
 *  - el origen real de un identificador (análisis de flujo de datos).
 */


const ROOT = process.cwd();
const TYPES_FILE = join(ROOT, "src", "integrations", "supabase", "types.ts");

const SERVER_DIRS = [
  join(ROOT, "src", "lib"),
  join(ROOT, "src", "lib", "server"),
  join(ROOT, "src", "routes", "api"),
  join(ROOT, "src", "integrations", "supabase"),
];

/** Nombres con los que se referencia al cliente service_role. */
const PRIVILEGED_RECEIVERS = ["admin", "supabaseAdmin", "adminClient"];

/**
 * Excepciones explícitas: operaciones privilegiadas sobre tablas con empresa
 * cuyo alcance NO puede expresarse como filtro de empresa en la propia
 * consulta. Cada entrada exige el patrón exacto de la operación y su
 * justificación; cualquier otra consulta sobre la misma tabla sigue fallando.
 */
interface AllowEntry {
  file: string;
  table: string;
  match: RegExp;
  reason: string;
}

const ALLOWLIST: AllowEntry[] = [
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
    file: "src/lib/platformAdmin.functions.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación del alta de empresa (operador de plataforma) sobre el usuario que acaba de crearse.",
  },
  {
    file: "src/lib/customerPortal.functions.ts",
    table: "organization_memberships",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación de la invitación al portal sobre el usuario recién creado.",
  },
  {
    file: "src/lib/customerPortal.functions.ts",
    table: "customer_portal_accounts",
    match: /\.delete\(\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Compensación de la invitación al portal sobre el usuario recién creado.",
  },
  {
    file: "src/lib/customerPortal.functions.ts",
    table: "customer_portal_accounts",
    match: /\.select\(\s*"id"\s*\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Existencia del vínculo legado por identidad: sólo devuelve id y decide si manda la cuenta con empresa.",
  },
  {
    file: "src/lib/customerPortal.functions.ts",
    table: "organization_memberships",
    match: /\.select\(\s*"organization_id"\s*\)\s*\.eq\(\s*"auth_user_id"/,
    reason:
      "Lectura que DERIVA la empresa del vínculo legado; el resultado se compara contra la empresa del staff.",
  },
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function serverSourceFiles(): string[] {
  const seen = new Set<string>();
  for (const dir of SERVER_DIRS) for (const f of walk(dir)) seen.add(f);
  return [...seen].sort();
}

/** Tablas con columna `organization_id` según los tipos generados. */
function orgScopedTables(): Set<string> {
  const types = readFileSync(TYPES_FILE, "utf8");
  const tables = new Set<string>();
  // Bloques `      nombre_tabla: {` dentro de Tables/Views con su Row.
  const re = /\n {6}(\w+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(types)) !== null) {
    const [, table, row] = m;
    if (table && row && /\borganization_id\??:/.test(row)) tables.add(table);
  }
  return tables;
}

/** Devuelve el texto de la cadena de consulta que arranca en `.from(` */
function extractChain(source: string, fromIndex: number): string {
  let depth = 0;
  for (let i = fromIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && (ch === ";" || ch === "\n")) {
      // Fin de sentencia, o salto de línea que no continúa la cadena.
      if (ch === ";") return source.slice(fromIndex, i);
      const rest = source.slice(i + 1).match(/^\s*/)?.[0] ?? "";
      const next = source[i + 1 + rest.length];
      if (next !== "." && next !== ")" && next !== ",") {
        return source.slice(fromIndex, i);
      }
    }
  }
  return source.slice(fromIndex);
}

/** ¿El receptor inmediatamente anterior al `.from(` es el cliente privilegiado? */
function receiverBefore(source: string, dotIndex: number): string | null {
  let i = dotIndex - 1;
  while (i >= 0 && /\s/.test(source[i] ?? "")) i--;
  let end = i + 1;
  while (i >= 0 && /[\w$]/.test(source[i] ?? "")) i--;
  const ident = source.slice(i + 1, end);
  return ident || null;
}

/**
 * Origen del valor de empresa.
 *
 * No basta con que aparezca `organization_id` en la consulta: el valor debe
 * venir de una derivación de servidor (membresía / operador de plataforma),
 * nunca del cuerpo de la petición. `organization_id: data.organization_id`
 * en un insert sería un falso verde: el cliente elegiría la empresa.
 *
 * LÍMITE DECLARADO: esto es análisis léxico, no de flujo de datos. Comprueba
 * que el identificador usado sea uno de los nombres derivados en servidor y
 * que NO sea una propiedad del input; no puede demostrar que ese identificador
 * provenga realmente de la membresía. Esa parte se sostiene con la revisión
 * manual documentada en `docs/multiempresa/` y con las pruebas RLS.
 */
const UNTRUSTED_ROOTS =
  /^(?:data|input|payload|body|args|params|req|request|raw|meta|metadata)\b/;

/** Identificadores admitidos como empresa derivada en servidor. */
const TRUSTED_ORG_VALUE =
  /^(?:[A-Za-z_$][\w$]*\.)?(?:organizationId|orgId|ownOrganizationId|targetOrganizationId|callerOrganizationId)$/;

function isTrustedOrgValue(expr: string): boolean {
  const e = expr.trim().replace(/[,\s)]+$/, "");
  if (!e) return false;
  if (UNTRUSTED_ROOTS.test(e)) return false;
  return TRUSTED_ORG_VALUE.test(e);
}

/** Filtros de empresa en la propia cadena (select/update/delete). */
function filterScopeOrigin(chain: string): "trusted" | "untrusted" | "none" {
  let sawAny = false;
  const filters = [
    /\.eq\(\s*["'`]organization_id["'`]\s*,\s*([^),]+)\)/g,
    /\.in\(\s*["'`]organization_id["'`]\s*,\s*([^)]+)\)/g,
  ];
  for (const re of filters) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(chain)) !== null) {
      sawAny = true;
      if (isTrustedOrgValue(m[1] ?? "")) return "trusted";
    }
  }
  const match = /\.match\(\s*\{[^}]*organization_id\s*:\s*([^,}]+)/s.exec(chain);
  if (match) {
    sawAny = true;
    if (isTrustedOrgValue(match[1] ?? "")) return "trusted";
  }
  const or = /\.or\(([^)]*organization_id[^)]*)\)/s.exec(chain);
  if (or) {
    sawAny = true;
    // `.or()` interpola texto: se exige que la interpolación no venga del input.
    const interpolated = [...(or[1] ?? "").matchAll(/\$\{([^}]+)\}/g)].map(
      (x) => x[1] ?? "",
    );
    if (interpolated.length > 0 && interpolated.every(isTrustedOrgValue)) {
      return "trusted";
    }
    if (interpolated.length === 0) return "untrusted";
  }
  return sawAny ? "untrusted" : "none";
}

/** Valor de `organization_id` asignado en el payload de insert/upsert. */
function payloadScopeOrigin(chain: string): "trusted" | "untrusted" | "none" {
  const re = /\borganization_id\s*:\s*([^,\n}]+)/g;
  let m: RegExpExecArray | null;
  let sawAny = false;
  while ((m = re.exec(chain)) !== null) {
    sawAny = true;
    if (!isTrustedOrgValue(m[1] ?? "")) return "untrusted";
  }
  return sawAny ? "trusted" : "none";
}

function isWrite(chain: string): boolean {
  return /\.(insert|upsert)\(/.test(chain);
}

/**
 * Veredicto de una cadena privilegiada:
 *  - insert/upsert: debe ASIGNAR la empresa derivada (y ninguna del input);
 *  - resto: debe FILTRAR por la empresa derivada en esa misma cadena.
 */
function chainVerdict(chain: string): {
  ok: boolean;
  why: "ok" | "sin alcance" | "empresa de origen no confiable";
} {
  if (isWrite(chain)) {
    const origin = payloadScopeOrigin(chain);
    if (origin === "trusted") return { ok: true, why: "ok" };
    if (origin === "untrusted") {
      return { ok: false, why: "empresa de origen no confiable" };
    }
    return { ok: false, why: "sin alcance" };
  }
  const origin = filterScopeOrigin(chain);
  if (origin === "trusted") return { ok: true, why: "ok" };
  if (origin === "untrusted") {
    return { ok: false, why: "empresa de origen no confiable" };
  }
  return { ok: false, why: "sin alcance" };
}

interface Finding {
  file: string;
  table: string;
  why: string;
  snippet: string;
}

function scanPrivilegedQueries(): {
  findings: Finding[];
  usedAllowEntries: Set<AllowEntry>;
  inspected: number;
  writes: number;
} {
  const orgTables = orgScopedTables();
  const findings: Finding[] = [];
  const usedAllowEntries = new Set<AllowEntry>();
  let inspected = 0;
  let writes = 0;

  for (const file of serverSourceFiles()) {
    const source = readFileSync(file, "utf8");
    const rel = relative(ROOT, file).split("\\").join("/");
    const re = /\.from\(\s*["'`](\w+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const table = m[1];
      if (!table || !orgTables.has(table)) continue;
      const receiver = receiverBefore(source, m.index);
      if (!receiver || !PRIVILEGED_RECEIVERS.includes(receiver)) continue;
      inspected++;
      const chain = extractChain(source, m.index);
      if (isWrite(chain)) writes++;
      const verdict = chainVerdict(chain);
      if (verdict.ok) continue;
      const allowed = ALLOWLIST.find(
        (a) => a.file === rel && a.table === table && a.match.test(chain),
      );
      // Una excepción NUNCA puede tapar una empresa de origen no confiable.
      if (allowed && verdict.why === "sin alcance") {
        usedAllowEntries.add(allowed);
        continue;
      }
      findings.push({
        file: rel,
        table,
        why: verdict.why,
        snippet: chain.trim().slice(0, 160),
      });
    }
  }
  return { findings, usedAllowEntries, inspected, writes };
}


describe("aislamiento por organización en código de servidor", () => {
  it("las tablas con empresa se derivan de los tipos generados", () => {
    const tables = orgScopedTables();
    // Señal de que el parser sigue funcionando tras regenerar tipos.
    expect(tables.size).toBeGreaterThan(20);
    for (const t of ["feedback_reports", "invoices", "bookings"]) {
      expect(tables.has(t)).toBe(true);
    }
  });

  it("recorre los directorios de servidor esperados", () => {
    const files = serverSourceFiles().map((f) => relative(ROOT, f));
    expect(files.some((f) => f.startsWith("src/lib/"))).toBe(true);
    expect(files).toContain("src/lib/feedbackAi.functions.ts");
    expect(files).toContain("src/lib/server/adminGuards.server.ts");
  });

  it("ninguna consulta con service_role toca una tabla con empresa sin acotarla", () => {
    const { findings, inspected, writes } = scanPrivilegedQueries();
    expect(
      findings.map((f) => `${f.file} → ${f.table} [${f.why}]: ${f.snippet}`),
    ).toEqual([]);
    // El escáner debe estar viendo consultas reales, no cero por un regex roto.
    expect(inspected).toBeGreaterThan(5);
    // …y al menos una escritura, para que la rama insert/upsert no quede muerta.
    expect(writes).toBeGreaterThan(0);
  });

  it("todas las excepciones declaradas siguen correspondiendo a código real", () => {
    const { usedAllowEntries } = scanPrivilegedQueries();
    const stale = ALLOWLIST.filter((a) => !usedAllowEntries.has(a)).map(
      (a) => `${a.file} → ${a.table}`,
    );
    expect(stale).toEqual([]);
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it("classifyFeedbackReportFn acota lectura y escritura por organization_id", () => {
    const source = readFileSync(
      join(ROOT, "src", "lib", "feedbackAi.functions.ts"),
      "utf8",
    );
    expect(source).toContain("requireInternalOrganization");
    const scoped = source.match(/\.eq\("organization_id", organizationId\)/g) ??
      [];
    expect(scoped.length).toBeGreaterThanOrEqual(2);
  });

  it("detecta una lectura privilegiada sin alcance (prueba del detector)", () => {
    const fake =
      `const { data } = await admin\n  .from("feedback_reports")\n  .select("*")\n  .eq("id", id);\n`;
    const chain = extractChain(fake, fake.indexOf('.from("feedback_reports")'));
    expect(chainVerdict(chain)).toEqual({ ok: false, why: "sin alcance" });
    const ok = fake.replace('.eq("id", id)', '.eq("organization_id", orgId)');
    const okChain = extractChain(ok, ok.indexOf('.from("feedback_reports")'));
    expect(chainVerdict(okChain).ok).toBe(true);
  });

  it("rechaza un filtro cuya empresa viene del input", () => {
    const fake =
      `await admin\n  .from("invoices")\n  .select("*")\n  .eq("organization_id", data.organization_id);\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain)).toEqual({
      ok: false,
      why: "empresa de origen no confiable",
    });
  });

  it("rechaza un insert con organization_id: input.data.organization_id", () => {
    const fake =
      `await admin.from("invoices").insert({\n  folio: 1,\n  organization_id: input.data.organization_id,\n});\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain)).toEqual({
      ok: false,
      why: "empresa de origen no confiable",
    });
  });

  it("acepta un insert que asigna la empresa derivada en servidor", () => {
    const fake =
      `await admin.from("invoices").insert({\n  folio: 1,\n  organization_id: organizationId,\n});\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain).ok).toBe(true);
  });

  it("un insert sin organization_id no se da por seguro", () => {
    const fake = `await admin.from("invoices").insert({ folio: 1 });\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain)).toEqual({ ok: false, why: "sin alcance" });
  });

  it("una excepción no puede tapar una empresa de origen no confiable", () => {
    // El allowlist sólo aplica al caso 'sin alcance'; ver scanPrivilegedQueries.
    const fake =
      `await admin.from("invoices").insert({ organization_id: body.organization_id });\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain).why).toBe("empresa de origen no confiable");
  });
});


/** Endpoints retirados: un solo handler y sin código privilegiado residual. */
const RETIRED_ENDPOINTS = [
  "invite-user",
  "invite-customer",
  "delete-user",
  "reset-user-password",
  "toggle-user-status",
];

const PRIVILEGED_LEFTOVERS: [string, RegExp][] = [
  ["createClient", /createClient\s*\(/],
  ["SERVICE_ROLE_KEY", /SERVICE_ROLE_KEY/],
  ["auth.admin", /auth\.admin\./],
  ["lectura del cuerpo", /req\.(json|text|formData|arrayBuffer)\s*\(/],
  ["Deno.env.get", /Deno\.env\.get\s*\(/],
  ["consulta a tabla", /\.from\(["'][a-z_]+["']\)/],
];

describe("endpoints retirados de administración de usuarios", () => {
  for (const name of RETIRED_ENDPOINTS) {
    it(`${name}: un único Deno.serve con el handler retirado y sin código antiguo`, () => {
      const file = join(ROOT, "supabase", "functions", name, "index.ts");
      const source = readFileSync(file, "utf8");
      expect((source.match(/Deno\.serve\s*\(/g) ?? []).length).toBe(1);
      expect(source).toMatch(
        new RegExp(
          `Deno\\.serve\\(\\s*makeRetiredEndpointHandler\\(\\s*["']${name}["']`,
        ),
      );
      for (const [label, pattern] of PRIVILEGED_LEFTOVERS) {
        expect(
          pattern.test(source),
          `${name}/index.ts conserva código privilegiado (${label})`,
        ).toBe(false);
      }
      const imports = source.match(/^import .+$/gm) ?? [];
      expect(imports.length).toBe(1);
      expect(imports[0]).toContain("_shared/retiredEndpoint.ts");
    });
  }
});

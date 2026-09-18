import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ALLOWLIST,
  PRIVILEGED_RECEIVERS,
  ROOT,
  SERVER_DIRS,
  TYPES_FILE,
  type AllowEntry,
} from "./orgIsolationPolicy";

/**
 * Escáner léxico del detector de aislamiento por organización. Separado de la
 * prueba sólo por longitud de archivo; misma lógica y mismos veredictos.
 */
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

export function serverSourceFiles(): string[] {
  const seen = new Set<string>();
  for (const dir of SERVER_DIRS) for (const f of walk(dir)) seen.add(f);
  return [...seen].sort();
}

/** Tablas con columna `organization_id` según los tipos generados. */
export function orgScopedTables(): Set<string> {
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

/** ¿El salto de línea en `i` termina la cadena, o la siguiente línea la continúa? */
function lineBreakEndsChain(source: string, i: number): boolean {
  const spaces = source.slice(i + 1).match(/^\s*/)?.[0] ?? "";
  const next = source[i + 1 + spaces.length];
  return next !== "." && next !== ")" && next !== ",";
}

/** Devuelve el texto de la cadena de consulta que arranca en `.from(` */
export function extractChain(source: string, fromIndex: number): string {
  let depth = 0;
  for (let i = fromIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && ch === ";") return source.slice(fromIndex, i);
    else if (depth === 0 && ch === "\n" && lineBreakEndsChain(source, i)) {
      return source.slice(fromIndex, i);
    }
  }
  return source.slice(fromIndex);
}

/** ¿El receptor inmediatamente anterior al `.from(` es el cliente privilegiado? */
export function receiverBefore(source: string, dotIndex: number): string | null {
  let i = dotIndex - 1;
  while (i >= 0 && /\s/.test(source[i] ?? "")) i--;
  const end = i + 1;
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

export function isTrustedOrgValue(expr: string): boolean {
  const e = expr.trim().replace(/[,\s)]+$/, "");
  if (!e) return false;
  if (UNTRUSTED_ROOTS.test(e)) return false;
  return TRUSTED_ORG_VALUE.test(e);
}

/** Filtros de empresa en la propia cadena (select/update/delete). */
export function filterScopeOrigin(chain: string): "trusted" | "untrusted" | "none" {
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
  const match = /\.match\(\s*\{[^}]*organization_id\s*:\s*([^,}]+)/s.exec(
    chain,
  );
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
export function payloadScopeOrigin(chain: string): "trusted" | "untrusted" | "none" {
  const re = /\borganization_id\s*:\s*([^,\n}]+)/g;
  let m: RegExpExecArray | null;
  let sawAny = false;
  while ((m = re.exec(chain)) !== null) {
    sawAny = true;
    if (!isTrustedOrgValue(m[1] ?? "")) return "untrusted";
  }
  return sawAny ? "trusted" : "none";
}

export function isWrite(chain: string): boolean {
  return /\.(insert|upsert)\(/.test(chain);
}

/**
 * Veredicto de una cadena privilegiada:
 *  - insert/upsert: debe ASIGNAR la empresa derivada (y ninguna del input);
 *  - resto: debe FILTRAR por la empresa derivada en esa misma cadena.
 */
export function chainVerdict(chain: string): {
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

export interface Finding {
  file: string;
  table: string;
  why: string;
  snippet: string;
}

export function scanPrivilegedQueries(): {
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

import { readFileSync } from "node:fs";
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

import { ALLOWLIST, ROOT } from "./helpers/orgIsolationPolicy";
import {
  chainVerdict,
  extractChain,
  orgScopedTables,
  scanPrivilegedQueries,
  serverSourceFiles,
} from "./helpers/orgIsolationScanner";

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
    const files = serverSourceFiles().map((f) => relative(ROOT, f).replaceAll("\\", "/"));
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
    const scoped =
      source.match(/\.eq\("organization_id", organizationId\)/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(2);
  });

  it("detecta una lectura privilegiada sin alcance (prueba del detector)", () => {
    const fake = `const { data } = await admin\n  .from("feedback_reports")\n  .select("*")\n  .eq("id", id);\n`;
    const chain = extractChain(fake, fake.indexOf('.from("feedback_reports")'));
    expect(chainVerdict(chain)).toEqual({ ok: false, why: "sin alcance" });
    const ok = fake.replace('.eq("id", id)', '.eq("organization_id", orgId)');
    const okChain = extractChain(ok, ok.indexOf('.from("feedback_reports")'));
    expect(chainVerdict(okChain).ok).toBe(true);
  });

  it("rechaza un filtro cuya empresa viene del input", () => {
    const fake = `await admin\n  .from("invoices")\n  .select("*")\n  .eq("organization_id", data.organization_id);\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain)).toEqual({
      ok: false,
      why: "empresa de origen no confiable",
    });
  });

  it("rechaza un insert con organization_id: input.data.organization_id", () => {
    const fake = `await admin.from("invoices").insert({\n  folio: 1,\n  organization_id: input.data.organization_id,\n});\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain)).toEqual({
      ok: false,
      why: "empresa de origen no confiable",
    });
  });

  it("acepta un insert que asigna la empresa derivada en servidor", () => {
    const fake = `await admin.from("invoices").insert({\n  folio: 1,\n  organization_id: organizationId,\n});\n`;
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
    const fake = `await admin.from("invoices").insert({ organization_id: body.organization_id });\n`;
    const chain = extractChain(fake, fake.indexOf('.from("invoices")'));
    expect(chainVerdict(chain).why).toBe("empresa de origen no confiable");
  });
});

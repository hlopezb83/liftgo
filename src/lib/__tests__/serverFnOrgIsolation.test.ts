import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresión multiempresa (tramo 13).
 *
 * `supabaseAdmin` (service_role) NO aplica RLS: cualquier consulta hecha con él
 * sobre una tabla que tiene `organization_id` debe filtrar explícitamente por la
 * empresa derivada de la membresía interna. Esta prueba es estática: recorre las
 * server functions y falla si alguna usa `admin.from("<tabla con organización>")`
 * sin `requireInternalOrganization` / `requirePlatformOperator` en el archivo.
 */

const LIB_DIR = join(process.cwd(), "src", "lib");

/** Tablas operativas cuyo acceso con service_role exige alcance de empresa. */
const ORG_SCOPED_TABLES = [
  "feedback_reports",
  "feedback_status_history",
  "company_settings",
  "customers",
  "organization_customers",
  "invoices",
  "payments",
  "bookings",
  "quotes",
  "contracts",
  "suppliers",
  "supplier_bills",
  "supplier_payments",
  "forklifts",
  "documents",
];

function serverFunctionFiles(): string[] {
  return readdirSync(LIB_DIR)
    .filter((name) => name.endsWith(".functions.ts"))
    .map((name) => join(LIB_DIR, name));
}

describe("server functions: aislamiento por organización con service_role", () => {
  it("toda ruta que usa el cliente privilegiado deriva la empresa de la membresía", () => {
    const offenders: string[] = [];

    for (const file of serverFunctionFiles()) {
      const source = readFileSync(file, "utf8");
      const derivesOrganization = /require(InternalOrganization|PlatformOperator)\s*\(/
        .test(source);

      for (const table of ORG_SCOPED_TABLES) {
        const usesAdminTable = new RegExp(
          `admin\\s*\\n?\\s*\\.from\\(["']${table}["']\\)`,
        ).test(source);
        if (usesAdminTable && !derivesOrganization) {
          offenders.push(`${file} → admin.from("${table}") sin organización verificada`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("classifyFeedbackReportFn filtra lectura y escritura por organization_id", () => {
    const source = readFileSync(join(LIB_DIR, "feedbackAi.functions.ts"), "utf8");
    expect(source).toContain("requireInternalOrganization");
    const scopedFilters = source.match(/\.eq\("organization_id", organizationId\)/g) ?? [];
    // Una para la lectura del reporte y otra para la actualización.
    expect(scopedFilters.length).toBeGreaterThanOrEqual(2);
  });
});

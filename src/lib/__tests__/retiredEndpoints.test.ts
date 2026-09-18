import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers/orgIsolationPolicy";

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

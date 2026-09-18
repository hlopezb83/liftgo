// Regresión estructural: los endpoints retirados no deben conservar NADA del
// handler privilegiado anterior ni registrar un segundo `Deno.serve`.
//
// Un archivo con dos `Deno.serve(...)` puede dejar activo el handler viejo (o
// romper el arranque del runtime), de modo que el retiro dejaría de ser
// efectivo. Esta prueba lee el código fuente y falla ante ese patrón.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const RETIRED = [
  "invite-user",
  "invite-customer",
  "delete-user",
  "reset-user-password",
  "toggle-user-status",
];

/** Señales de que quedó código privilegiado en el archivo. */
const PRIVILEGED_PATTERNS: readonly [string, RegExp][] = [
  ["createClient", /createClient\s*\(/],
  ["SERVICE_ROLE_KEY", /SERVICE_ROLE_KEY/],
  ["auth.admin", /auth\.admin\./],
  ["requireRole/requireAdmin", /require(Role|Admin)\s*\(/],
  ["lectura del cuerpo", /req\.(json|text|formData|arrayBuffer)\s*\(/],
  ["Deno.env.get", /Deno\.env\.get\s*\(/],
  ["consulta a la base", /\.from\(["'][a-z_]+["']\)/],
];

function sourceOf(name: string): string {
  return Deno.readTextFileSync(
    new URL(`../${name}/index.ts`, import.meta.url),
  );
}

Deno.test("retirados: exactamente un Deno.serve por archivo", () => {
  for (const name of RETIRED) {
    const serves = sourceOf(name).match(/Deno\.serve\s*\(/g) ?? [];
    assertEquals(
      serves.length,
      1,
      `${name}/index.ts debe tener exactamente un Deno.serve (encontrados ${serves.length})`,
    );
  }
});

Deno.test("retirados: el único Deno.serve usa el handler retirado", () => {
  for (const name of RETIRED) {
    const src = sourceOf(name);
    assert(
      new RegExp(
        `Deno\\.serve\\(\\s*makeRetiredEndpointHandler\\(\\s*["']${name}["']`,
      ).test(src),
      `${name}/index.ts debe servir makeRetiredEndpointHandler("${name}")`,
    );
  }
});

Deno.test("retirados: no queda código privilegiado ni imports muertos", () => {
  for (const name of RETIRED) {
    const src = sourceOf(name);
    for (const [label, pattern] of PRIVILEGED_PATTERNS) {
      assert(
        !pattern.test(src),
        `${name}/index.ts conserva código privilegiado (${label})`,
      );
    }
    const imports = src.match(/^import .+$/gm) ?? [];
    assertEquals(
      imports.length,
      1,
      `${name}/index.ts sólo debe importar el handler retirado (imports: ${imports.length})`,
    );
    assert(
      (imports[0] ?? "").includes("_shared/retiredEndpoint.ts"),
      `${name}/index.ts importa un módulo que ya no necesita: ${imports[0]}`,
    );
  }
});

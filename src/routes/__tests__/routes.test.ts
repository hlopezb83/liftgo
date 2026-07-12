import { describe, expect, it } from "vitest";
import { ROUTES } from "@/routes/routes";
import { appRoutes } from "@/routes/routes-config";

// -----------------------------------------------------------------------------
// Guardrail: cada string en `ROUTES` debe existir en `appRoutes` (con :id
// como placeholder para builders) o vivir bajo `/portal/*`. Evita drift entre
// las dos fuentes de verdad de rutas.
// -----------------------------------------------------------------------------

type Node = string | ((id: string) => string) | { [k: string]: Node };

function collect(node: Node, acc: string[] = []): string[] {
  if (typeof node === "string") {
    acc.push(node);
  } else if (typeof node === "function") {
    acc.push(node(":id"));
  } else {
    Object.values(node).forEach((v) => collect(v as Node, acc));
  }
  return acc;
}

function normalize(path: string): string {
  return path.replace(/:[a-zA-Z]+/g, ":id");
}

describe("ROUTES ↔ appRoutes sincronía", () => {
  const declared = new Set(appRoutes.map((r) => normalize(r.path)));
  // Rutas del portal + login viven en árboles separados (AuthGuard / CustomerPortalRoutes).
  const portalWhitelist = new Set([
    "/portal", "/portal/login", "/portal/rentals", "/portal/quotes", "/portal/quotes/:id",
    "/portal/invoices", "/portal/invoices/:id", "/portal/invoices/:id/pago",
    "/portal/estado-cuenta", "/portal/contracts", "/portal/mis-reportes", "/portal/leaderboard",
  ]);
  // Legacy redirect declarado inline en App.tsx.
  const inlineRoutes = new Set(["/expenses"]);

  const referenced = collect(ROUTES as unknown as Node);

  it.each(referenced)("%s existe en appRoutes o portal", (path) => {
    const normalized = normalize(path);
    const exists = declared.has(normalized) || portalWhitelist.has(normalized) || inlineRoutes.has(normalized);
    expect(exists, `ROUTES referencia "${path}" pero no existe en appRoutes`).toBe(true);
  });
});

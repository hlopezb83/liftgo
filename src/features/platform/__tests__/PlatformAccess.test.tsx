import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { platformAccessSchema, type PlatformAccess } from "@/lib/platformAccess.types";
import { PlatformAccessScope } from "../components/PlatformAccessScope";
import { canAccessPlatformRoute, usePlatformCapabilities } from "../hooks/usePlatformAccess";

const root: PlatformAccess = { isOperator: true, profile: "root", revision: "1", capabilities: ["organizations.read", "organizations.details", "catalogs.read", "catalogs.write", "audit.read"] };
const support: PlatformAccess = { isOperator: true, profile: "support", revision: "2", capabilities: ["organizations.read", "catalogs.read"] };

describe("permisos y caché de plataforma", () => {
  it("rechaza metadata incompleta y nunca confía en un booleano aislado", () => {
    expect(platformAccessSchema.safeParse({ isOperator: true }).success).toBe(false);
    expect(platformAccessSchema.safeParse({ ...support, capabilities: ["all"] }).success).toBe(false);
    expect(platformAccessSchema.safeParse({ ...support, isOperator: false }).success).toBe(false);
  });

  it("soporte entra al resumen pero no a fichas, importación o bitácora", () => {
    expect(canAccessPlatformRoute(support, "/platform")).toBe(true);
    expect(canAccessPlatformRoute(support, "/platform/organizations")).toBe(true);
    expect(canAccessPlatformRoute(support, "/platform/organizations/company-id")).toBe(false);
    expect(canAccessPlatformRoute(support, "/platform/catalogs/import")).toBe(false);
    expect(canAccessPlatformRoute(support, "/platform/audit")).toBe(false);
    expect(canAccessPlatformRoute(support, "/platform/operators")).toBe(false);
  });

  it("una revisión nueva destruye formularios y resultados de la autoridad anterior", () => {
    let current: QueryClient | undefined;
    function Probe() {
      const { can } = usePlatformCapabilities();
      const [draft, setDraft] = useState("");
      const client = useQueryClient();
      useEffect(() => { current = client; }, [client]);
      return <><input aria-label="Borrador" value={draft} onChange={(e) => setDraft(e.target.value)} />
        {can("catalogs.write") && <button>Guardar maestro</button>}</>;
    }
    const tree = (access: PlatformAccess) => <PlatformAccessScope key={access.revision} access={access}><Probe /></PlatformAccessScope>;
    const view = render(tree(root));
    const oldClient = current!;
    oldClient.setQueryData(["platform", "private"], { secret: "previous-authority" });
    fireEvent.change(screen.getByLabelText("Borrador"), { target: { value: "Cambios sin guardar" } });
    view.rerender(tree(support));
    expect(screen.getByLabelText("Borrador")).toHaveValue("");
    expect(screen.queryByText("Guardar maestro")).not.toBeInTheDocument();
    expect(oldClient.getQueryData(["platform", "private"])).toBeUndefined();
    expect(current!.getQueryData(["platform", "private"])).toBeUndefined();
  });

  it("sin ámbito verificado no muestra controles privilegiados", () => {
    function Probe() { const { can } = usePlatformCapabilities(); return <p>{can("catalogs.write") ? "Permitido" : "Sin permiso"}</p>; }
    render(<Probe />);
    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
  });
  it("cada operador puede ver su sesión pero sólo la capacidad explícita permite administrar operadores", () => {
    expect(canAccessPlatformRoute(support, "/platform/security")).toBe(true);
    expect(canAccessPlatformRoute(support, "/platform/operators")).toBe(false);
    expect(canAccessPlatformRoute({ ...root, capabilities: [...root.capabilities, "operators.read"] }, "/platform/operators")).toBe(true);
    expect(canAccessPlatformRoute({ isOperator: false, profile: null, revision: null, capabilities: [] }, "/platform/security")).toBe(false);
  });
  it("integraciones y monitoreo necesitan sus capacidades específicas", () => {
    expect(canAccessPlatformRoute(support, "/platform/integrations")).toBe(false);
    expect(canAccessPlatformRoute(support, "/platform/monitoring")).toBe(false);
    const health = { ...support, capabilities: [...support.capabilities, "integrations.read", "monitoring.read"] } as PlatformAccess;
    expect(canAccessPlatformRoute(health, "/platform/integrations")).toBe(true);
    expect(canAccessPlatformRoute(health, "/platform/monitoring")).toBe(true);
  });
});

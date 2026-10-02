import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationRow } from "@/lib/platformHealth.types";
import { PlatformIntegrationCard } from "../components/PlatformIntegrationCard";
const row: IntegrationRow = { id: "93930000-0000-4000-8000-000000000011", name: "Empresa CI", active: true,
  mode: "test", keyConfigured: true, lastCheck: null, queuedJobs: 0, exhaustedJobs: 0 };
describe("estado visible de la integración", () => {
  it("una llave disponible no se presenta como conexión comprobada", () => {
    render(<PlatformIntegrationCard row={row} observedAt="2026-10-02T10:00:00Z" canCheck={false} checking={false} disabled={false} onCheck={vi.fn()} />);
    expect(screen.getByText("Configurada")).toBeInTheDocument(); expect(screen.getByText("Sin comprobación vigente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comprobar conexión" })).not.toBeInTheDocument();
  });
  it("no permite comprobar una empresa suspendida", () => {
    const onCheck = vi.fn(); render(<PlatformIntegrationCard row={{ ...row, active: false }} observedAt="2026-10-02T10:00:00Z" canCheck checking={false} disabled={false} onCheck={onCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión" })); expect(onCheck).not.toHaveBeenCalled();
  });
  it("una consulta sin finalizar deja de parecer en curso al actualizar la fuente", () => {
    render(<PlatformIntegrationCard row={{ ...row, lastCheck: { status: "pending", startedAt: "2026-10-02T09:55:00Z", completedAt: null, latencyMs: null, httpStatus: null, version: null } }}
      observedAt="2026-10-02T10:00:00Z" canCheck checking={false} disabled={false} onCheck={vi.fn()} />);
    expect(screen.getByText("Comprobación interrumpida")).toBeInTheDocument();
  });
});

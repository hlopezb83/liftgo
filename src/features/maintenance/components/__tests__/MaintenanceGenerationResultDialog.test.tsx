import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaintenanceGenerationResultDialog } from "../MaintenanceGenerationResultDialog";

afterEach(cleanup);
describe("resultado de mantenimiento", () => {
  it("expone resultados parciales y su detalle, y permite cerrar sin volver a generar", () => {
    const onClose = vi.fn();
    render(<MaintenanceGenerationResultDialog onClose={onClose} result={{
      generated: 2, skipped: 1, omitted_by_status: 0, failed_policies: 1, pending_remaining: 3,
      month: "2026-10", details: ["Error al insertar log de MC-1 (2026-09)"],
    }} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Resultado del mantenimiento mensual");
    expect(screen.getByText("Generación de mantenimiento incompleta")).toBeInTheDocument();
    expect(screen.getByText("Error al insertar log de MC-1 (2026-09)")).toBeInTheDocument();
    expect(screen.getByText("Periodos pendientes").nextElementSibling).toHaveTextContent("3");
    fireEvent.click(screen.getByText("Cerrar", { selector: "button" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no sustituye datos desconocidos por cero", () => {
    render(<MaintenanceGenerationResultDialog onClose={vi.fn()} result={{
      generated: 0, skipped: 0, month: "2026-10",
    }} />);
    expect(screen.getByText("Resultado de mantenimiento por revisar")).toBeInTheDocument();
    expect(screen.getByText("Periodos pendientes").nextElementSibling).toHaveTextContent("Sin confirmar");
  });
});

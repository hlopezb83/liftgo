import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ForkliftSpecsCard } from "../ForkliftSpecsCard";

const access = vi.hoisted(() => ({ canSeeCosts: true }));
vi.mock("../../../hooks/useCanSeeFinancialCosts", () => ({ useCanSeeFinancialCosts: () => access.canSeeCosts }));
const base = { id: "equipment-demo", model: "FD50", manufacturer: "LIFT GO", year: 0,
  insurance_provider: null, insurance_policy_number: null, insurance_expiry: null,
  insurance_cost: null, acquisition_cost: 0 } as Tables<"forklifts">;

beforeEach(() => { access.canSeeCosts = true; });
afterEach(cleanup);

describe("seguro según información visible", () => {
  it("vacío: empieza cerrado y permite ver los cuatro campos sin afirmar falta de seguro", () => {
    const { container } = render(<ForkliftSpecsCard forklift={base} />);
    const disclosure = container.querySelector("details");
    expect(disclosure).not.toHaveAttribute("open");
    const summary = screen.getByText("Seguro: sin datos registrados");
    expect(summary.tagName).toBe("SUMMARY");
    expect(within(summary).getByText("Ver campos")).toBeInTheDocument();
    // Activación nativa de details (happy-dom no implementa el toggle del navegador).
    fireEvent.click(summary);
    disclosure?.setAttribute("open", "");
    expect(screen.getByText("Aseguradora")).toBeVisible();
    expect(screen.getByText("Costo Póliza")).toBeVisible();
    expect(screen.queryByText("Sin seguro")).not.toBeInTheDocument();
  });

  it.each([
    { insurance_provider: "GNP Seguros" },
    { insurance_policy_number: "POL-2026-001" },
    { insurance_expiry: "2026-12-31" },
    { insurance_cost: 15000 },
    { insurance_cost: 0 },
  ])("un campo visible, incluyendo cero, abre inicialmente: %j", (fields) => {
    const { container } = render(<ForkliftSpecsCard forklift={{ ...base, ...fields }} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.queryByText("Seguro: sin datos registrados")).not.toBeInTheDocument();
    for (const value of Object.values(fields)) {
      const text = typeof value === "number" ? formatCurrency(value) : value;
      expect(within(container.querySelector("details") as HTMLElement).getByText(text)).toBeInTheDocument();
    }
  });

  it("conserva todos los valores completos y no modifica el equipo", () => {
    const equipment = Object.freeze({ ...base, insurance_provider: "Aseguradora extensa\nSucursal México",
      insurance_policy_number: "POL".repeat(80), insurance_expiry: "2026-12-31", insurance_cost: 123456789.12 });
    const { container } = render(<ForkliftSpecsCard forklift={equipment} />);
    const disclosure = container.querySelector("details");
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText(equipment.insurance_provider)).toHaveClass("whitespace-pre-wrap", "[overflow-wrap:anywhere]");
    expect(screen.getByText(equipment.insurance_policy_number)).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByText(formatCurrency(equipment.insurance_cost))).toBeInTheDocument();
    expect(equipment.insurance_cost).toBe(123456789.12);
  });

  it("costo oculto no abre el seguro ni genera celdas financieras no autorizadas", () => {
    access.canSeeCosts = false;
    const { container, rerender } = render(<ForkliftSpecsCard forklift={{ ...base, insurance_cost: 15000, acquisition_cost: 250000 }} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Seguro: sin datos registrados")).toBeInTheDocument();
    expect(screen.queryByText("Costo Póliza")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo de Adquisición")).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(15000))).not.toBeInTheDocument();
    rerender(<ForkliftSpecsCard forklift={{ ...base, insurance_provider: "GNP", insurance_cost: 15000 }} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("GNP")).toBeInTheDocument();
  });

  it("al cambiar visibilidad recalcula desde los campos autorizados, sin borrar datos", () => {
    const equipment = Object.freeze({ ...base, insurance_cost: 0 });
    const { container, rerender } = render(<ForkliftSpecsCard forklift={equipment} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    access.canSeeCosts = false;
    rerender(<ForkliftSpecsCard forklift={equipment} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("Costo Póliza")).not.toBeInTheDocument();
    access.canSeeCosts = true;
    rerender(<ForkliftSpecsCard forklift={equipment} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(equipment.insurance_cost).toBe(0);
  });

  it("cero en adquisición y año permanece visible", () => {
    render(<ForkliftSpecsCard forklift={base} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(0))).toBeInTheDocument();
  });

  it("cadenas de espacios no cuentan como información registrada", () => {
    const { container } = render(<ForkliftSpecsCard forklift={{ ...base, insurance_provider: "  ", insurance_policy_number: "\n" }} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });
});
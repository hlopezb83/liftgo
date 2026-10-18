import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ForkliftSpecsCard } from "../ForkliftSpecsCard";

vi.mock("../../../hooks/useCanSeeFinancialCosts", () => ({ useCanSeeFinancialCosts: () => true }));

const base = {
  id: "equipment-demo",
  model: "FD50",
  manufacturer: "LIFT GO",
  year: 0,
  capacity_kg: 5000,
  mast_height_m: 4.3,
  fuel_type: "Diesel",
  serial_number: "SN-2026-0001",
  acquisition_cost: 0,
  insurance_provider: null,
  insurance_policy_number: null,
  insurance_expiry: null,
  insurance_cost: null,
} as Tables<"forklifts">;

/** Devuelve el texto mostrado justo debajo de la etiqueta indicada. */
function valueOf(label: string) {
  const labelElement = screen.getByText(label);
  return labelElement.parentElement?.querySelector("p.font-medium")?.textContent;
}

afterEach(cleanup);

describe("especificaciones: representación de textos ausentes", () => {
  it("cadena vacía, de espacios o de salto de línea se muestra como raya", () => {
    render(<ForkliftSpecsCard forklift={{ ...base, model: "", manufacturer: "   ", serial_number: "\t\n" }} />);
    expect(valueOf("Modelo")).toBe("—");
    expect(valueOf("Fabricante")).toBe("—");
    expect(valueOf("No. de Serie")).toBe("—");
  });

  it("nulo se muestra como raya", () => {
    render(<ForkliftSpecsCard forklift={{ ...base, manufacturer: null, serial_number: null }} />);
    expect(valueOf("Fabricante")).toBe("—");
    expect(valueOf("No. de Serie")).toBe("—");
  });

  it("conserva los valores existentes tal como están registrados", () => {
    render(<ForkliftSpecsCard forklift={base} />);
    expect(valueOf("Modelo")).toBe("FD50");
    expect(valueOf("Fabricante")).toBe("LIFT GO");
    expect(valueOf("No. de Serie")).toBe("SN-2026-0001");
    expect(valueOf("Capacidad")).toBe("5000 kg");
    expect(valueOf("Tipo de Combustible")).toBe("Diésel");
  });

  it("el cero numérico sigue visible en año y en costo", () => {
    render(<ForkliftSpecsCard forklift={base} />);
    expect(valueOf("Año")).toBe("0");
    expect(valueOf("Costo de Adquisición")).toBe(formatCurrency(0));
  });

  it("los espacios del seguro no cuentan como dato y se muestran con raya", () => {
    const { container } = render(
      <ForkliftSpecsCard forklift={{ ...base, insurance_provider: "  ", insurance_policy_number: "\n" }} />,
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Seguro: sin datos registrados")).toBeInTheDocument();
    expect(valueOf("Aseguradora")).toBe("—");
    expect(valueOf("No. Póliza")).toBe("—");
  });

  it("no modifica los datos del equipo", () => {
    const equipment = Object.freeze({ ...base, model: "", serial_number: "  " });
    render(<ForkliftSpecsCard forklift={equipment} />);
    expect(equipment.model).toBe("");
    expect(equipment.serial_number).toBe("  ");
    expect(equipment.year).toBe(0);
  });
});

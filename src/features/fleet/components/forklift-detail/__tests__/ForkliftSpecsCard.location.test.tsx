import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { ForkliftSpecsCard } from "../ForkliftSpecsCard";

vi.mock("../../../hooks/useCanSeeFinancialCosts", () => ({ useCanSeeFinancialCosts: () => false }));
const forklift = { id: "f-1", name: "MTY-LG-2602", model: "FD50", manufacturer: "LIFT GO" } as Tables<"forklifts">;

describe("ubicación en especificaciones", () => {
  it("identifica la dirección registrada y advierte que puede ser histórica", () => {
    render(<ForkliftSpecsCard forklift={forklift} currentLocation="Av. Industria 428 · Andén 3" />);
    expect(screen.getByText("Ubicación registrada")).toBeInTheDocument();
    expect(screen.queryByText("Ubicación Actual")).not.toBeInTheDocument();
    expect(screen.getByText(/Puede ser histórica/)).toBeInTheDocument();
  });

  it("distingue error de lectura sin mostrar una dirección anterior como vigente", () => {
    render(<ForkliftSpecsCard forklift={forklift} currentLocation="Dirección anterior" locationError />);
    expect(screen.getByText("No se pudo cargar la ubicación")).toBeInTheDocument();
    expect(screen.queryByText("Dirección anterior")).not.toBeInTheDocument();
  });
});

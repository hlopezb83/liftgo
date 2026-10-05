import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Forklift } from "../../../hooks/forklifts/useForklifts";
import { FleetMobileCard } from "../FleetRowAndCard";

const forklift = { id: "f-1", name: "MTY-LG-2602", model: "FD50", status: "available", serial_number: "LG-AUD-260926-02", fuel_type: "diesel" } as Forklift;

describe("FleetMobileCard", () => {
  it("incluye la ubicación registrada sin perder la identidad y el estado", () => {
    render(<FleetMobileCard forklift={forklift} hasActivePolicy={false} location="Av. Industria 428 · Andén 3" onClick={vi.fn()} />);
    expect(screen.getByText("Av. Industria 428 · Andén 3")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleName(/Ubicación registrada.*Av. Industria/);
    expect(screen.getByText("MTY-LG-2602")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
  });

  it("no presume una ubicación cuando no hay dato", () => {
    render(<FleetMobileCard forklift={forklift} hasActivePolicy={false} onClick={vi.fn()} />);
    expect(screen.queryByText("Ubicación registrada")).not.toBeInTheDocument();
  });
});

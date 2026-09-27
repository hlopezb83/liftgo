import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeliveryStatusCard } from "../DeliveryInfoCards";

describe("DeliveryStatusCard · instante completado en Monterrey", () => {
  it.each([
    ["2026-09-27T02:03:59.688602+00:00", "26/09/2026 20:03"],
    ["2026-09-26T20:03:59.688602-06:00", "26/09/2026 20:03"],
    ["2027-01-01T02:03:00Z", "31/12/2026 20:03"],
  ])("preserva hora y día local de %s", (completedAt, expected) => {
    render(<DeliveryStatusCard type="delivery" scheduledDate="2026-09-26" scheduledTime="09:00" completedAt={completedAt} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByText("26/09/2026")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("no fabrica un completado para entregas todavía pendientes", () => {
    render(<DeliveryStatusCard type="delivery" scheduledDate="2026-09-26" scheduledTime={null} completedAt={null} />);
    expect(screen.queryByText("Completado")).not.toBeInTheDocument();
  });
});

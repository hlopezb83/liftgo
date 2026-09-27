import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TestRouter } from "@/test/router";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { ReturnInspectionMobileCard } from "../ReturnInspectionMobileCard";

const inspection = {
  id: "inspection-1", inspection_number: "DEV-0001", inspected_at: "2026-09-27T02:05:39.541Z",
  condition: "good", damage_cost: 0, forklifts: { name: "MTY-LG-2602", model: "FD50" },
  bookings: { customer_name: "Logística Álamo" },
} as ReturnInspectionWithJoins;

describe("ReturnInspectionMobileCard · navegación accesible", () => {
  it("expone un enlace nativo enfocable con folio, destino y datos de la devolución", async () => {
    render(<TestRouter><ReturnInspectionMobileCard inspection={inspection} /></TestRouter>);
    const link = await screen.findByRole("link", { name: "Ver devolución DEV-0001" });
    expect(link).toHaveAttribute("href", "/returns/inspection-1");
    expect(link).toHaveTextContent("MTY-LG-2602");
    expect(link).toHaveTextContent("Logística Álamo");
    expect(link).toHaveTextContent("26/09/2026");
    link.focus();
    expect(link).toHaveFocus();
    expect(link).toHaveClass("focus-visible:ring-2");
  });
});

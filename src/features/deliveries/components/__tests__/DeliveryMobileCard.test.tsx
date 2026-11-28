import { render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { describe, expect, it } from "vitest";
import { DeliveryMobileCard, type DeliveryCardItem } from "../DeliveryMobileCard";

const delivery: DeliveryCardItem = {
  id: "d-1", delivery_number: "ENT-0001", type: "delivery", status: "completed",
  forklift_id: "fl-1", scheduled_date: "2026-09-01", scheduled_time: "09:00",
  address: "Avenida Industrial 100", driver_name: "Diego Salinas", forklifts: { name: "MTY-FD50-01" },
};

describe("DeliveryMobileCard", () => {
  it("abre el detalle y muestra la unidad del join aunque el mapa no la tenga", async () => {
    render(<TestRouter><DeliveryMobileCard d={delivery} forkliftMap={new Map()} /></TestRouter>);
    const link = await screen.findByRole("link", { name: "Ver entrega ENT-0001" });
    expect(link).toHaveAttribute("href", "/deliveries/d-1");
    expect(link).toHaveTextContent("MTY-FD50-01");
    expect(link).toHaveTextContent("Diego Salinas");
  });

  it("conserva el respaldo del mapa y distingue una recolección", async () => {
    const pickup = { ...delivery, type: "pickup", forklifts: null };
    render(<TestRouter><DeliveryMobileCard d={pickup} forkliftMap={new Map([["fl-1", { name: "MTY-FB25-02" }]])} /></TestRouter>);
    const link = await screen.findByRole("link", { name: "Ver recolección ENT-0001" });
    expect(link).toHaveTextContent("MTY-FB25-02");
  });
});

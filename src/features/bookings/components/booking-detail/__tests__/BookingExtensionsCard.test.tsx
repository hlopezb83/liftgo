import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));

import { BookingExtensionsCard } from "../BookingExtensionsCard";

const base = {
  id: "ext-1",
  original_end_date: "2026-01-10",
  new_end_date: "2026-01-20",
  created_at: "2026-01-05T00:00:00Z",
};

function renderCard(ext: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <BookingExtensionsCard extensions={[{ ...base, ...ext }] as never} />
    </MemoryRouter>,
  );
}

describe("BookingExtensionsCard · extensión ya facturada", () => {
  it("mantiene visible el botón de facturar pero deshabilitado, junto a Ver factura", () => {
    renderCard({ invoice_id: "inv-9" });
    expect(screen.getByRole("button", { name: /facturar extensión/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ver factura/i })).toBeInTheDocument();
    expect(screen.getByText("Facturada")).toBeInTheDocument();
  });

  it("permite facturar cuando la extensión aún no tiene factura", () => {
    renderCard({});
    expect(screen.getByRole("button", { name: /facturar extensión/i })).toBeEnabled();
  });
});

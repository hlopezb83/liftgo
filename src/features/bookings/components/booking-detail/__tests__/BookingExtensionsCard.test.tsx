import { render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ financial: true }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true, useHasFinancialAccess: () => access.financial }));
beforeEach(() => { access.financial = true; });

import { BookingExtensionsCard } from "../BookingExtensionsCard";

const base = {
  id: "ext-1",
  original_end_date: "2026-01-10",
  new_end_date: "2026-01-20",
  created_at: "2026-01-05T00:00:00Z",
};

function renderCard(ext: Record<string, unknown>) {
  return render(
    <TestRouter>
      <BookingExtensionsCard extensions={[{ ...base, ...ext }] as never} />
    </TestRouter>,
  );
}

describe("BookingExtensionsCard · extensión ya facturada", () => {
  it("dispatcher conserva motivo y fechas, sin badge ni enlace de facturación", async () => {
    access.financial = false;
    renderCard({ invoice_id: "inv-9", reason: "Extensión operativa de prueba" });
    expect(await screen.findByText("Extensión operativa de prueba")).toBeInTheDocument();
    expect(screen.getByText("Extensiones")).toBeInTheDocument();
    expect(screen.queryByText("Facturada")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver factura/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /facturar extensión/i })).not.toBeInTheDocument();
  });

  it("mantiene visible el botón de facturar pero deshabilitado, junto a Ver factura", async () => {
    renderCard({ invoice_id: "inv-9" });
    expect(await screen.findByRole("button", { name: /facturar extensión/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /ver factura/i })).toBeInTheDocument();
    expect(screen.getByText("Facturada")).toBeInTheDocument();
  });

  it("permite facturar cuando la extensión aún no tiene factura", async () => {
    renderCard({});
    expect(await screen.findByRole("button", { name: /facturar extensión/i })).toBeEnabled();
  });

  it("muestra pendiente de emisión cuando la factura sigue en borrador", async () => {
    renderCard({ pending_invoice_id: "inv-draft" });
    expect(await screen.findByText("Pendiente de emisión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /facturar extensión/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /ver factura/i })).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPageHeader } from "../DetailPageHeader";

const navigate = vi.fn();
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => navigate }));

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("DetailPageHeader return navigation", () => {
  it("restores the saved filters for a pathname fallback", () => {
    window.sessionStorage.setItem("list-filters:/invoices", "q=cliente&status=sent");
    render(<DetailPageHeader title="Factura" backTo="/invoices" />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(navigate).toHaveBeenCalledWith("/invoices?q=cliente&status=sent");
  });

  it("preserves an explicit URL without adding cached filters", () => {
    const backTo = "/calendar?date=2026-11-01&view=gantt&range=month";
    window.sessionStorage.setItem(`list-filters:${backTo}`, "q=obsolete");
    render(<DetailPageHeader title="Reserva" backTo={backTo} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(navigate).toHaveBeenCalledWith(backTo);
  });

  it("preserves an explicitly unfiltered origin over newer session filters", () => {
    window.sessionStorage.setItem("list-filters:/invoices", "q=other-tab");
    render(<DetailPageHeader title="Factura" backTo="/invoices" restoreListFilters={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(navigate).toHaveBeenCalledWith("/invoices");
  });
});

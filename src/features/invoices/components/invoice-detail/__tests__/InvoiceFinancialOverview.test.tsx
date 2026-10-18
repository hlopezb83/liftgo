import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InvoiceFinancialOverview } from "../InvoiceFinancialOverview";
import { InvoiceDetailBadges } from "../InvoiceDetailBadges";
import { InvoiceDetailIdentifiers } from "../InvoiceDetailIdentifiers";
import { computeInvoiceVisibility } from "@/lib/rules/invoiceVisibility";

vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

describe("InvoiceFinancialOverview", () => {
  it("muestra total, pagado y saldo con moneda y crédito secundario", () => {
    render(<InvoiceFinancialOverview total={63800} totalPaid={20000} balance={33800} creditedAmount={10000} currency="mxn" />);
    expect(screen.getByTestId("overview-total")).toHaveTextContent("$63,800.00 MXN");
    expect(screen.getByTestId("overview-pagado")).toHaveTextContent("$20,000.00 MXN");
    expect(screen.getByTestId("overview-saldo")).toHaveTextContent("$33,800.00 MXN");
    expect(screen.getByTestId("overview-credited")).toHaveTextContent("$10,000.00 MXN");
  });

  it("factura pagada en USD: saldo cero y sin crédito", () => {
    render(<InvoiceFinancialOverview total={1500} totalPaid={1500} balance={0} creditedAmount={0} currency="USD" />);
    expect(screen.getByTestId("overview-saldo")).toHaveTextContent(/0\.00 USD$/);
    expect(screen.queryByTestId("overview-credited")).toBeNull();
  });

  it("no trunca importes largos", () => {
    render(<InvoiceFinancialOverview total={123456789012.34} totalPaid={0} balance={123456789012.34} creditedAmount={0} currency="MXN" />);
    const el = screen.getByTestId("overview-total");
    expect(el.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(el).toHaveTextContent("$123,456,789,012.34");
  });
});

describe("InvoiceDetailBadges tonos (StatusBadge)", () => {
  const tone = (p: Partial<Parameters<typeof InvoiceDetailBadges>[0]>) => {
    const { container, unmount } = render(
      <InvoiceDetailBadges invoiceStatus="sent" cfdiStatus="stamped" cancellationStatus={null} showSandboxChip={false} {...p} />,
    );
    const t = container.querySelector("[data-tone]")?.getAttribute("data-tone");
    const text = container.textContent;
    unmount();
    return { t, text };
  };
  it("pagada / parcial / cancelada / cancelación pendiente conservan semántica", () => {
    expect(tone({ invoiceStatus: "paid" })).toEqual({ t: "success", text: "Pagada" });
    expect(tone({ invoiceStatus: "partial" })).toEqual({ t: "warning", text: "Parcial" });
    expect(tone({ cancellationStatus: "accepted" })).toEqual({ t: "destructive", text: "Cancelada" });
    expect(tone({ cancellationStatus: "pending" })).toEqual({ t: "warning", text: "Cancelación en proceso" });
  });
  it("Sandbox se muestra como insignia separada", () => {
    render(<InvoiceDetailBadges invoiceStatus="sent" cfdiStatus="stamped" showSandboxChip cfdiXmlPending />);
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.getByText("XML por recuperar")).toBeInTheDocument();
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
  });
  it("visibilidad existente: sandbox según entorno del CFDI", () => {
    const v = computeInvoiceVisibility({ status: "sent", cfdi_status: "stamped", metodo_pago: "PPD", facturapi_env: "live" }, null);
    expect(v.showSandboxChip).toBe(false);
    expect(v.showRepColumn).toBe(true);
  });
});

describe("InvoiceDetailIdentifiers desplegable", () => {
  it("se expande y copia el UUID completo", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const uuid = "eb3abf2f-d404-49fd-bb6f-d694a36d1056";
    const { container } = render(<InvoiceDetailIdentifiers cfdiUuid={uuid} serie="F" folio="1" />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Identificadores"));
    expect(details.open).toBe(true);
    expect(screen.getByTitle(uuid)).toHaveClass("select-all");
    const btn = screen.getByRole("button", { name: "Copiar Folio fiscal SAT (UUID)" });
    expect(btn).toHaveClass("h-11", "w-11");
    await act(async () => { fireEvent.click(btn); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(uuid);
  });
});

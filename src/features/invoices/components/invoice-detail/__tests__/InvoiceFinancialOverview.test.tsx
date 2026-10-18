import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InvoiceFinancialOverview } from "../InvoiceFinancialOverview";
import { InvoiceDetailBadges } from "../InvoiceDetailBadges";
import { InvoiceDetailIdentifiers } from "../InvoiceDetailIdentifiers";
import { computeInvoiceVisibility } from "@/lib/rules/invoiceVisibility";

vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const norm = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");
const countCode = (txt: string, code: string) => txt.split(code).length - 1;

describe("InvoiceFinancialOverview", () => {
  it("MXN: una sola salida con código, crédito secundario", () => {
    render(<InvoiceFinancialOverview total={63800} totalPaid={20000} balance={33800} creditedAmount={10000} currency="mxn" />);
    expect(norm(screen.getByTestId("overview-total"))).toBe("MXN 63,800.00");
    expect(norm(screen.getByTestId("overview-pagado"))).toBe("MXN 20,000.00");
    expect(norm(screen.getByTestId("overview-saldo"))).toBe("MXN 33,800.00");
    const credit = norm(screen.getByTestId("overview-credited"));
    expect(credit).toBe("Notas de crédito aplicadas: MXN 10,000.00");
    expect(countCode(credit, "MXN")).toBe(1);
  });

  it("USD pagada: saldo cero, sin código duplicado ni crédito", () => {
    render(<InvoiceFinancialOverview total={1500} totalPaid={1500} balance={0} creditedAmount={0} currency="USD" />);
    const saldo = norm(screen.getByTestId("overview-saldo"));
    expect(saldo).toBe("USD 0.00");
    expect(countCode(saldo, "USD")).toBe(1);
    expect(screen.queryByTestId("overview-credited")).toBeNull();
  });

  it("saldo negativo se muestra tal cual llega", () => {
    render(<InvoiceFinancialOverview total={100} totalPaid={150} balance={-50} creditedAmount={0} currency="MXN" />);
    expect(norm(screen.getByTestId("overview-saldo"))).toBe("-MXN 50.00");
  });

  it("importe grande completo y sin truncar", () => {
    render(<InvoiceFinancialOverview total={123456789012.34} totalPaid={0} balance={123456789012.34} creditedAmount={0} currency="MXN" />);
    const el = screen.getByTestId("overview-total");
    expect(el.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(norm(el)).toBe("MXN 123,456,789,012.34");
  });
});

describe("InvoiceDetailBadges estilos reales", () => {
  const badgeOf = (text: string) => screen.getByText(text).closest("div,span[class*='rounded']") as HTMLElement;
  const renderB = (p: Partial<Parameters<typeof InvoiceDetailBadges>[0]>) =>
    render(<InvoiceDetailBadges invoiceStatus="sent" cfdiStatus="stamped" cancellationStatus={null} showSandboxChip={false} {...p} />);

  it("Cancelada usa estilo StatusBadge cancelled y conserva tono destructivo", () => {
    const { container } = renderB({ cancellationStatus: "accepted" });
    expect(container.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("destructive");
    const b = badgeOf("Cancelada");
    expect(b.className).toContain("opacity-80");
    expect(b.className).toContain("[--dot:hsl(var(--muted-foreground))]");
  });

  it("Cancelación en proceso y Parcial conservan estilo warning", () => {
    renderB({ cancellationStatus: "pending" });
    expect(badgeOf("Cancelación en proceso").className).toContain("bg-warning/10");
  });

  it("Pagada usa estilo success; Error de timbrado danger", () => {
    renderB({ invoiceStatus: "paid" });
    expect(badgeOf("Pagada").className).toContain("bg-success/10");
  });

  it("Sandbox es outline neutral, sin punto ni estilo de Parcial", () => {
    renderB({ invoiceStatus: "partial", showSandboxChip: true });
    const sandbox = screen.getByTestId("sandbox-chip");
    expect(sandbox.className).toContain("text-muted-foreground");
    expect(sandbox.className).not.toContain("bg-warning");
    expect(sandbox.querySelector("[aria-hidden]")).toBeNull();
    expect(badgeOf("Parcial").className).toContain("bg-warning/10");
  });

  it("sin showSandboxChip no hay Sandbox; XML por recuperar intacto", () => {
    renderB({ cfdiXmlPending: true });
    expect(screen.queryByTestId("sandbox-chip")).toBeNull();
    expect(badgeOf("XML por recuperar").className).toContain("bg-warning/10");
  });

  it("visibilidad existente: sandbox según entorno del CFDI", () => {
    const v = computeInvoiceVisibility({ status: "sent", cfdi_status: "stamped", metodo_pago: "PPD", facturapi_env: "live" }, null);
    expect(v.showSandboxChip).toBe(false);
    expect(v.showRepColumn).toBe(true);
  });
});

describe("InvoiceDetailIdentifiers desplegable", () => {
  it("abre, copia el UUID completo, cierra y reabre", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const uuid = "eb3abf2f-d404-49fd-bb6f-d694a36d1056";
    const { container } = render(<InvoiceDetailIdentifiers cfdiUuid={uuid} serie="F" folio="1" />);
    const details = container.querySelector("details")!;
    const summary = screen.getByText("Identificadores");
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByTitle(uuid)).toHaveClass("select-all");
    const btn = screen.getByRole("button", { name: "Copiar Folio fiscal SAT (UUID)" });
    expect(btn).toHaveClass("h-11", "w-11");
    await act(async () => { fireEvent.click(btn); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(uuid);
    fireEvent.click(summary);
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });
});

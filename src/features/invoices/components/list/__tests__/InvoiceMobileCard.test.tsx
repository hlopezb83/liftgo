import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import { describe, expect, it } from "vitest";
import { InvoiceMobileCard, type InvoiceCardItem } from "../InvoiceMobileCard";

const invoice: InvoiceCardItem = {
  id: "inv-1", invoice_number: "FAC-0001", customer_name: "Constructora Regia",
  status: "sent", issued_at: "2026-09-01", due_date: "2026-09-30", total: 20300, moneda: "USD",
};

describe("InvoiceMobileCard", () => {
  it("keeps the filtered list origin in the detail history entry", async () => {
    const origin = "/invoices?q=cliente&status=sent&cfdi=stamped&from=2026-10-01&to=2026-10-31";
    function Probe() {
      const location = useLocation();
      return <output data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>;
    }
    render(<TestRouter initialEntries={[origin]}><InvoiceMobileCard inv={invoice} /><Probe /></TestRouter>);
    fireEvent.click(await screen.findByRole("link", { name: "Ver factura FAC-0001 de Constructora Regia" }));
    await waitFor(() => {
      const location = JSON.parse(screen.getByTestId("location").textContent ?? "{}");
      expect(location.pathname).toBe("/invoices/inv-1");
      expect(location.state.invoiceListBackTo).toBe(origin);
    });
  });

  it("ofrece enlace al detalle y conserva importe, moneda y fechas", async () => {
    render(<TestRouter><InvoiceMobileCard inv={invoice} /></TestRouter>);
    const link = await screen.findByRole("link", { name: "Ver factura FAC-0001 de Constructora Regia" });
    expect(link).toHaveAttribute("href", "/invoices/inv-1");
    expect(link).toHaveTextContent("20,300.00");
    expect(link).toHaveTextContent("USD");
    expect(link).toHaveTextContent("01/09/2026");
    expect(link).toHaveTextContent("30/09/2026");
  });
});

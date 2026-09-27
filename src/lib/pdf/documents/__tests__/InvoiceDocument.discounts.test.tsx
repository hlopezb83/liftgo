import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-pdf/renderer", () => {
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Document: tag("section"), Page: tag("section"), View: tag("div"), Text: tag("span"), Image: tag("img"),
    StyleSheet: { create: <T,>(styles: T) => styles },
  };
});

import { InvoiceDocument } from "../InvoiceDocument";

afterEach(cleanup);

describe("InvoiceDocument — descuentos heredados", () => {
  it("el documento incluye descuentos, netos y subtotal/totales coherentes", () => {
    render(<InvoiceDocument company={null} logoBase64={null} invoiceLabel="FAC-QA"
      customerName="Logística Álamo" customerRfc={null} customerCp={null}
      issuedAt="2026-09-26" dueDate={null} status="draft" formaPago={null} metodoPago={null}
      cfdiStatus={null} cfdiUuid={null} currency="MXN" notes={null}
      lineItems={[
        { description: "Semanal", quantity: 1, unit_price: 4250.25, total: 4250.25, discount: 425.03, discount_type: "$" },
        { description: "Diaria", quantity: 1, unit_price: 750.50, total: 750.50, discount: 75.05, discount_type: "$" },
      ]} subtotal={4500.67} taxRate={16} taxAmount={720.11} total={5220.78} />);
    expect(screen.getByText("DESCUENTO")).toBeInTheDocument();
    expect(screen.getByText("NETO")).toBeInTheDocument();
    for (const value of ["-$425.03", "-$75.05", "$3,825.22", "$675.45", "$4,500.67", "$720.11"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText("$5,220.78 MXN")).toBeInTheDocument();
    expect(screen.queryByText("$5,000.75")).not.toBeInTheDocument();
  });
});

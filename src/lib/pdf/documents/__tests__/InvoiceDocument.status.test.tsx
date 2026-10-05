import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoiceDocument, type InvoiceDocumentProps } from "../InvoiceDocument";

vi.mock("@react-pdf/renderer", () => {
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Document: tag("section"), Page: tag("section"), View: tag("div"), Text: tag("span"), Image: tag("img"),
    StyleSheet: { create: <T,>(styles: T) => styles },
  };
});
afterEach(cleanup);
const draft: InvoiceDocumentProps = {
  company: null, logoBase64: null, invoiceLabel: "FAC-0001",
  customerName: "Logística Álamo", customerRfc: null, customerCp: null,
  issuedAt: "2026-10-05", dueDate: null, status: "draft", formaPago: null, metodoPago: null,
  cfdiStatus: null, cfdiUuid: null, currency: "MXN", notes: null, lineItems: [],
  subtotal: 1000, taxRate: 16, taxAmount: 160, total: 1160,
};
describe("InvoiceDocument — identidad del documento descargado", () => {
  it("identifica un borrador dentro del PDF, sin afirmar emisión o timbrado", () => {
    render(<InvoiceDocument {...draft} />);
    expect(screen.getByText("BORRADOR DE FACTURA")).toBeInTheDocument();
    expect(screen.getByText("BORRADOR SIN TIMBRAR")).toBeInTheDocument();
    expect(screen.getByText("Documento preliminar. No es un CFDI timbrado.")).toBeInTheDocument();
    expect(screen.queryByText("TIMBRADO SAT")).not.toBeInTheDocument();
    expect(screen.queryByText("Emitida:")).not.toBeInTheDocument();
  });

  it("un UUID sin estado confirmado no convierte el borrador en CFDI", () => {
    render(<InvoiceDocument {...draft} cfdiStatus="pending" cfdiUuid="uuid-incompleto" />);
    expect(screen.getByText("BORRADOR SIN TIMBRAR")).toBeInTheDocument();
    expect(screen.queryByText("TIMBRADO SAT")).not.toBeInTheDocument();
  });

  it("conserva la identificación fiscal cuando el timbrado está confirmado", () => {
    render(<InvoiceDocument {...draft} status="sent" cfdiStatus="stamped" cfdiUuid="uuid-confirmado" />);
    expect(screen.getByText("TIMBRADO SAT")).toBeInTheDocument();
    expect(screen.getByText("Este documento es una representación impresa de un CFDI.")).toBeInTheDocument();
    expect(screen.queryByText("BORRADOR SIN TIMBRAR")).not.toBeInTheDocument();
  });

  it("un timbrado confirmado prevalece sobre un estado draft heredado", () => {
    render(<InvoiceDocument {...draft} cfdiStatus="stamped" cfdiUuid="uuid-confirmado" />);
    expect(screen.getByText("TIMBRADO SAT")).toBeInTheDocument();
    expect(screen.queryByText("BORRADOR SIN TIMBRAR")).not.toBeInTheDocument();
  });
});

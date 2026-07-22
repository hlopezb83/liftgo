import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InvoiceDetailBadges } from "../InvoiceDetailBadges";

describe("InvoiceDetailBadges (R7 Bloque 11)", () => {
  it("muestra 'Timbrando…' cuando cfdi_status='stamping'", () => {
    render(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="stamping"
        cancellationStatus={null}
        showSandboxChip={false}
      />,
    );
    expect(screen.getByText("Timbrando…")).toBeInTheDocument();
  });

  it("muestra 'Error de timbrado' cuando cfdi_status='error'", () => {
    render(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="error"
        cancellationStatus={null}
        showSandboxChip={false}
      />,
    );
    expect(screen.getByText("Error de timbrado")).toBeInTheDocument();
  });

  it("muestra 'Timbrada' cuando cfdi_status='stamped' e invoice='sent'", () => {
    render(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="stamped"
        cancellationStatus={null}
        showSandboxChip={false}
      />,
    );
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
  });

  it("borrador tiene prioridad sobre estados fiscales", () => {
    render(
      <InvoiceDetailBadges
        invoiceStatus="draft"
        cfdiStatus="stamping"
        cancellationStatus={null}
        showSandboxChip={false}
      />,
    );
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });
});

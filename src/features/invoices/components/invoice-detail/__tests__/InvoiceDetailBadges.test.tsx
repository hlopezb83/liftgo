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

describe("InvoiceDetailBadges (R3 bajo-9): badge XML por recuperar", () => {
  it("muestra 'XML por recuperar' cuando cfdiXmlPending=true", () => {
    render(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="stamped"
        cancellationStatus={null}
        showSandboxChip={false}
        cfdiXmlPending={true}
      />,
    );
    expect(screen.getByText("XML por recuperar")).toBeInTheDocument();
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
  });

  it("NO muestra 'XML por recuperar' cuando cfdiXmlPending=false u omitido", () => {
    const { rerender } = render(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="stamped"
        cancellationStatus={null}
        showSandboxChip={false}
        cfdiXmlPending={false}
      />,
    );
    expect(screen.queryByText("XML por recuperar")).not.toBeInTheDocument();

    rerender(
      <InvoiceDetailBadges
        invoiceStatus="sent"
        cfdiStatus="stamped"
        cancellationStatus={null}
        showSandboxChip={false}
      />,
    );
    expect(screen.queryByText("XML por recuperar")).not.toBeInTheDocument();
  });
});

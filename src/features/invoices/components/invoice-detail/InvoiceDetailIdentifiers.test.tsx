import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvoiceDetailIdentifiers } from "./InvoiceDetailIdentifiers";

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
}));

describe("InvoiceDetailIdentifiers", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renderiza el título de la tarjeta", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid="abc-123"
        serie="A"
        folio="145"
      />,
    );
    expect(screen.getByText("Identificadores")).toBeInTheDocument();
  });

  it("muestra el folio interno", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie={null}
        folio={host}
      />,
    );
    expect(screen.getByText("FAC-0073")).toBeInTheDocument();
  });

  it("muestra 'Serie A · Folio 145' cuando serie y folio están presentes", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid="abc-123"
        serie="A"
        folio="145"
      />,
    );
    expect(screen.getByText("Serie A · Folio 145")).toBeInTheDocument();
  });

  it("muestra placeholder cuando serie o folio faltan", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );
    expect(
      screen.getByText("— pendiente de timbrado —"),
    ).toBeInTheDocument();
  });

  it("copia el folio interno al portapapeles", async () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );

    const copyBtn = screen.getByLabelText("Copiar Folio interno");
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("FAC-0073");
  });

  it("muestra el tooltip de folio interno con la explicación correcta", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );

    const infoIcon = screen
      .getByText("Folio interno")
      .closest("div")
      ?.querySelector("svg");
    expect(infoIcon).toBeTruthy();

    if (infoIcon) {
      fireEvent.mouseEnter(infoIcon);
      expect(
        screen.getByText(
          /Control administrativo LiftGo\. Se asigna al crear el borrador y nunca cambia/,
        ),
      ).toBeInTheDocument();
    }
  });

  it("muestra el tooltip de Serie y Folio con la explicación correcta", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie="B"
        folio="99"
      />,
    );

    const infoIcon = screen
      .getByText("Serie y Folio")
      .closest("div")
      ?.querySelector("svg");
    expect(infoIcon).toBeTruthy();

    if (infoIcon) {
      fireEvent.mouseEnter(infoIcon);
      expect(
        screen.getByText(
          /Serie y número fiscal asignados por el PAC \(Facturapi\) al timbrar/,
        ),
      ).toBeInTheDocument();
    }
  });
});

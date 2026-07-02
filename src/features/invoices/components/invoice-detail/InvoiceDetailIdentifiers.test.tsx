import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InvoiceDetailIdentifiers } from "./InvoiceDetailIdentifiers";

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
        folio={null}
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

  it("muestra placeholder en filas sin valor", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );
    const placeholders = screen.getAllByText("— pendiente de timbrado —");
    expect(placeholders).toHaveLength(2);
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
    await act(async () => {
      fireEvent.click(copyBtn);
    });

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

    expect(
      screen.getByText(
        "Control administrativo LiftGo. Se asigna al crear el borrador y nunca cambia, incluso si timbras días después o fuera de orden.",
      ),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(
        "Serie y número fiscal asignados por el PAC (Facturapi) al timbrar. Útil para cruzar contra su portal. Son distintos del folio interno y del UUID.",
      ),
    ).toBeInTheDocument();
  });

  it("muestra el tooltip de Folio fiscal SAT con la explicación correcta", () => {
    render(
      <InvoiceDetailIdentifiers
        invoiceNumber="FAC-0073"
        cfdiUuid="sat-uuid-123"
        serie={null}
        folio={null}
      />,
    );

    expect(
      screen.getByText(
        "Identificador oficial ante el SAT (36 caracteres). Se asigna al timbrar y es distinto del folio interno.",
      ),
    ).toBeInTheDocument();
  });
});

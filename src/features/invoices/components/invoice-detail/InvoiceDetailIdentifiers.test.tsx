// @vitest-environment jsdom
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
        cfdiUuid="abc-123"
        serie="A"
        folio="145"
      />,
    );
    expect(screen.getByText("Identificadores")).toBeInTheDocument();
  });

  it("muestra 'Serie A · Folio 145' cuando serie y folio están presentes", () => {
    render(
      <InvoiceDetailIdentifiers
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
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );
    const placeholders = screen.getAllByText("— pendiente de timbrado —");
    expect(placeholders).toHaveLength(2);
  });

  it("copia el UUID al portapapeles", async () => {
    render(
      <InvoiceDetailIdentifiers
        cfdiUuid="sat-uuid-123"
        serie={null}
        folio={null}
      />,
    );

    const copyBtn = screen.getByLabelText("Copiar Folio fiscal SAT (UUID)");
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("sat-uuid-123");
  });

  it("muestra el tooltip de Serie y Folio con la explicación correcta", () => {
    render(
      <InvoiceDetailIdentifiers
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

  it("muestra '— pendiente de timbrado —' cuando no está timbrada", () => {
    render(
      <InvoiceDetailIdentifiers
        cfdiUuid={null}
        serie={null}
        folio={null}
      />,
    );
    expect(screen.getAllByText("— pendiente de timbrado —")).toHaveLength(2);
  });

  it("muestra '— no informado por el PAC —' en Serie/Folio cuando ya está timbrada sin serie", () => {
    render(
      <InvoiceDetailIdentifiers
        cfdiUuid="sat-uuid-123"
        serie={null}
        folio={null}
        isStamped
      />,
    );
    expect(screen.getByText("— no informado por el PAC —")).toBeInTheDocument();
    // El UUID sí se muestra, no debe aparecer "pendiente" en esa fila
    expect(screen.queryByText("— pendiente de timbrado —")).not.toBeInTheDocument();
  });
});

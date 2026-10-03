import type { ReactNode } from "react";
// @vitest-environment jsdom
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvoiceDetailIdentifiers } from "./InvoiceDetailIdentifiers";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("InvoiceDetailIdentifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("un rechazo al copiar no muestra éxito y conserva el identificador seleccionable", async () => {
    const cause = new DOMException("Clipboard permission denied", "NotAllowedError");
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(cause);
    render(<InvoiceDetailIdentifiers cfdiUuid="uuid-auditoria" serie="F" folio="1" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar Folio fiscal SAT (UUID)" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.objectContaining({ error: cause, severity: "warning", phase: "clipboard" })));
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(screen.getByTitle("uuid-auditoria")).toBeInTheDocument();
  });

  it("envuelve el UUID en móvil y conserva accesible la acción de copiar", () => {
    const uuid = "eb3abf2f-d404-49fd-bb6f-d694a36d1056";
    render(<InvoiceDetailIdentifiers cfdiUuid={uuid} serie="F" folio="958" />);
    expect(screen.getByTitle(uuid)).toHaveClass("break-all");
    expect(screen.getByTitle(uuid).parentElement?.parentElement).toHaveClass("flex-col");
    expect(screen.getByLabelText("Copiar Folio fiscal SAT (UUID)")).toBeInTheDocument();
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

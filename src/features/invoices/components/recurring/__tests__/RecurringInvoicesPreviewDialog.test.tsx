// R9-02: cada apertura del diálogo es una sesión nueva (sin consentimiento de
// tarifa heredado y con la selección reconstruida desde el preview actual).
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { RecurringInvoicesPreviewDialog } from "../RecurringInvoicesPreviewDialog";
import type {
  RecurringPreviewLine,
  RecurringPreviewResponse,
} from "../../../hooks/invoices/recurring/usePreviewRecurringInvoices";

afterEach(cleanup);

function line(over: Partial<RecurringPreviewLine> & { bookingId: string }): RecurringPreviewLine {
  return {
    bookingCode: over.bookingId,
    customerId: "c1",
    customerName: "Acme",
    forkliftName: "MT-01",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    periodLabel: "Agosto 2026",
    monthlyRate: 1000,
    billedAmount: 1000,
    isProrated: false,
    eligible: true,
    ...over,
  };
}

const data = (lines: RecurringPreviewLine[]): RecurringPreviewResponse =>
  ({ period: "2026-08", lines }) as RecurringPreviewResponse;

function setup(lines: RecurringPreviewLine[]) {
  const view = render(
    <RecurringInvoicesPreviewDialog
      open
      onOpenChange={() => {}}
      data={data(lines)}
      isLoading={false}
      isGenerating={false}
      onConfirm={() => {}}
    />,
  );
  const rerenderWith = (open: boolean, next: RecurringPreviewLine[]) =>
    view.rerender(
      <RecurringInvoicesPreviewDialog
        open={open}
        onOpenChange={() => {}}
        data={data(next)}
        isLoading={false}
        isGenerating={false}
        onConfirm={() => {}}
      />,
    );
  return { rerenderWith };
}

const staleCheckbox = () =>
  screen.getByLabelText("Confirmar facturación de periodos con tarifa modificada");

const generateButton = () => screen.getByRole("button", { name: /Generar/ });

describe("RecurringInvoicesPreviewDialog — sesión por apertura", () => {
  it("al reabrir se pierde el consentimiento de tarifa modificada", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "s", rateWarning: true })];
    const { rerenderWith } = setup(lines);

    fireEvent.click(staleCheckbox());
    expect(staleCheckbox()).toBeChecked();
    // R8-05: la selección inicial es vacía; seleccionamos todo para el test.
    fireEvent.click(screen.getByLabelText(/Seleccionar todas de Acme/));
    expect(generateButton()).toHaveTextContent("Generar 2 facturas");

    rerenderWith(false, lines);
    rerenderWith(true, lines);

    expect(staleCheckbox()).not.toBeChecked();
    // R9-02: al reabrir la selección inicia vacía de nuevo.
    expect(generateButton()).toHaveTextContent("Generar 0 facturas");
  });

  it("al reabrir la selección se reconstruye desde el preview actual", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    const { rerenderWith } = setup(lines);
    // R8-05: selección inicial vacía.
    fireEvent.click(screen.getByLabelText(/Seleccionar todas de Acme/));
    expect(generateButton()).toHaveTextContent("Generar 2 facturas");

    // El usuario desmarca una fila y cierra el diálogo.
    fireEvent.click(screen.getByLabelText(/Incluir la reserva a /));
    expect(generateButton()).toHaveTextContent("Generar 1 factura");

    rerenderWith(false, lines);
    rerenderWith(true, lines);

    // R9-02: al reabrir no se conserva lo desmarcado, se vuelve a "nada seleccionado".
    expect(generateButton()).toHaveTextContent("Generar 0 facturas");
  });

  it("un refresh con el diálogo abierto conserva la selección del usuario", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    const { rerenderWith } = setup(lines);

    fireEvent.click(screen.getByLabelText(/Incluir la reserva a /));
    expect(generateButton()).toHaveTextContent("Generar 1 factura");

    // Refetch: mismas líneas (nuevos objetos) mientras sigue abierto.
    rerenderWith(true, lines.map((l) => ({ ...l })));
    expect(generateButton()).toHaveTextContent("Generar 1 factura");
  });
});

// R9-18: la generación envía exclusivamente las combinaciones reserva+periodo
// marcadas; excluir un periodo no arrastra a los demás de la misma reserva.
describe("RecurringInvoicesPreviewDialog — selección por reserva + periodo", () => {
  it("al excluir un periodo sólo se envía el otro", () => {
    const selections: Array<Array<{ bookingId: string; periodStart: string }>> = [];
    const lines = [
      line({ bookingId: "a" }),
      line({
        bookingId: "a",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        periodLabel: "Septiembre 2026",
      }),
    ];
    render(
      <RecurringInvoicesPreviewDialog
        open
        onOpenChange={() => {}}
        data={data(lines)}
        isLoading={false}
        isGenerating={false}
        onConfirm={(s) => selections.push(s)}
      />,
    );

    // Seleccionar todo primero.
    fireEvent.click(screen.getByLabelText(/Seleccionar todas de Acme/));
    expect(generateButton()).toHaveTextContent("Generar 2 facturas");

    fireEvent.click(screen.getByLabelText(/periodo Septiembre 2026/));
    expect(generateButton()).toHaveTextContent("Generar 1 factura");

    fireEvent.click(generateButton());
    expect(selections[0]).toEqual([{ bookingId: "a", periodStart: "2026-08-01" }]);
  });
});

// R9-02: cada apertura del diálogo es una sesión nueva (sin consentimiento de
// tarifa heredado y con la selección reconstruida desde el preview actual).
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
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

const generateButton = () => screen.getByRole("button", { name: /Generar/ });

describe("alcance futuro explícito", () => {
  const future = line({ bookingId: "future", previewFingerprint: "future-hash", isFuture: true, periodStart: "2026-12-01", periodLabel: "Diciembre 2026" });

  it("no renderiza facturadas ni infla grupos o contadores y muestra bloqueos aparte", () => {
    setup([
      line({ bookingId: "old", customerName: "Cliente ya facturado", eligible: false, reason: "already_invoiced" }),
      line({ bookingId: "a" }),
      line({ bookingId: "review", eligible: false, reason: "period_overlap_review" }),
    ]);
    expect(screen.queryByText("Cliente ya facturado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Incluir la reserva old/)).not.toBeInTheDocument();
    expect(screen.getByText("Períodos disponibles:").parentElement).toHaveTextContent("1");
    expect(screen.getByRole("region", { name: "Períodos que requieren revisión" })).toHaveTextContent("Cobertura de períodos ambigua");
  });

  it("cero disponibles no oculta revisión histórica", () => {
    setup([line({ bookingId: "review", eligible: false, reason: "legacy_period_review" })]);
    expect(screen.getByText("Períodos disponibles:").parentElement).toHaveTextContent("0");
    expect(screen.getByText(/Historial de facturación sin período verificable/)).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });

  it("requiere selección manual, la olvida al apagar futuros y al reabrir", () => {
    const rows = [line({ bookingId: "a" }), future];
    const { rerenderWith } = setup(rows);
    const optIn = () => screen.getByRole("checkbox", { name: "Incluir períodos futuros" });
    expect(optIn()).not.toBeChecked();
    expect(screen.queryByLabelText(/Incluir la reserva future/)).not.toBeInTheDocument();
    fireEvent.click(optIn());
    expect(screen.getByText("Futuro")).toBeInTheDocument();
    expect(screen.getByLabelText(/Incluir la reserva future/)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/Incluir la reserva future/));
    expect(generateButton()).toHaveTextContent("Generar 1 periodo");
    fireEvent.click(optIn());
    expect(generateButton()).toBeDisabled();
    fireEvent.click(optIn());
    expect(screen.getByLabelText(/Incluir la reserva future/)).not.toBeChecked();
    rerenderWith(false, rows);
    rerenderWith(true, rows);
    expect(optIn()).not.toBeChecked();
    expect(screen.queryByLabelText("Hasta el mes")).not.toBeInTheDocument();
  });

  it("refresh con importe distinto exige seleccionar otra vez", () => {
    const { rerenderWith } = setup([line({ bookingId: "a" })]);
    fireEvent.click(screen.getByLabelText(/Incluir la reserva a /));
    rerenderWith(true, [line({ bookingId: "a", billedAmount: 1500 })]);
    expect(generateButton()).toBeDisabled();
    expect(screen.getByLabelText(/Incluir la reserva a /)).not.toBeChecked();
  });

  it("cambiar alcance sólo calcula preview; no permite confirmar datos viejos ni errores", () => {
    const onScopeChange = vi.fn();
    const onConfirm = vi.fn();
    const props = { open: true, onOpenChange: vi.fn(), isLoading: false, isGenerating: false, onScopeChange, onConfirm };
    const current = { ...data([line({ bookingId: "a" })]), scope: { includeFuturePeriods: false } };
    const view = render(<RecurringInvoicesPreviewDialog {...props} data={current} />);
    fireEvent.click(screen.getByLabelText(/Incluir la reserva a /));
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir períodos futuros" }));
    expect(onScopeChange).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(generateButton()).toBeDisabled();
    const month = screen.getByLabelText("Hasta el mes") as HTMLInputElement;
    fireEvent.change(month, { target: { value: month.max } });
    expect(onScopeChange).toHaveBeenLastCalledWith({ includeFuturePeriods: true, futureThroughMonth: month.max });
    expect(onConfirm).not.toHaveBeenCalled();
    view.rerender(<RecurringInvoicesPreviewDialog {...props} data={current} isError />);
    expect(generateButton()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo calcular");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar vista previa" }));
    expect(onConfirm).not.toHaveBeenCalled();
    const scope = { includeFuturePeriods: true, futureThroughMonth: month.max };
    view.rerender(<RecurringInvoicesPreviewDialog {...props} data={{ ...data([future]), scope }} />);
    fireEvent.click(screen.getByLabelText(/Incluir la reserva future/));
    fireEvent.click(generateButton());
    expect(onConfirm).toHaveBeenCalledWith([{ bookingId: "future", periodStart: "2026-12-01", expectedFingerprint: "future-hash" }], false, scope);
  });
});


describe("anticipos consecutivos", () => {
  it("no permite saltar un pendiente y desmarca sólo los futuros dependientes", () => {
    const rows = [
      line({ bookingId: "a", previewFingerprint: "a-due" }),
      line({ bookingId: "a", periodStart: "2026-12-01", periodLabel: "Diciembre 2026", isFuture: true, previewFingerprint: "a-future" }),
      line({ bookingId: "b", periodStart: "2026-12-01", periodLabel: "Diciembre 2026", isFuture: true, previewFingerprint: "b-future" }),
    ];
    setup(rows);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir períodos futuros" }));
    const futureA = screen.getByLabelText("Incluir la reserva a del periodo Diciembre 2026");
    const dueA = screen.getByLabelText("Incluir la reserva a del periodo Agosto 2026");
    const futureB = screen.getByLabelText("Incluir la reserva b del periodo Diciembre 2026");
    expect(futureA).toBeDisabled();
    expect(screen.getByText("Selecciona primero los períodos pendientes anteriores de esta reserva.")).toBeInTheDocument();
    fireEvent.click(dueA);
    expect(futureA).toBeEnabled();
    expect(futureA).not.toBeChecked();
    fireEvent.click(futureA);
    fireEvent.click(futureB);
    fireEvent.click(dueA);
    expect(futureA).not.toBeChecked();
    expect(futureA).toBeDisabled();
    expect(futureB).toBeChecked();
    fireEvent.click(dueA);
    expect(futureA).not.toBeChecked();
  });

  it("un anterior bloqueado por revisión no puede habilitar un anticipo", () => {
    setup([
      line({ bookingId: "a", eligible: false, reason: "legacy_period_review" }),
      line({ bookingId: "a", periodStart: "2026-12-01", periodLabel: "Diciembre 2026", isFuture: true, previewFingerprint: "future" }),
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir períodos futuros" }));
    expect(screen.getByLabelText("Incluir la reserva a del periodo Diciembre 2026")).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Seleccionar todas de Acme/));
    expect(generateButton()).toBeDisabled();
  });
});


it("un servidor sin huella bloquea anticipos con explicación visible", () => {
  setup([line({ bookingId: "future", isFuture: true })]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Incluir períodos futuros" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Esta vista previa no permite verificar anticipos");
  expect(screen.getByLabelText(/Incluir la reserva future/)).toBeDisabled();
  expect(generateButton()).toBeDisabled();
  const month = screen.getByLabelText("Hasta el mes") as HTMLInputElement;
  expect(month.value > month.min).toBe(true);
});

it("cambiar la huella del plan desmarca aunque la renta visible no cambie", () => {
  const { rerenderWith } = setup([line({ bookingId: "a", previewFingerprint: "old" })]);
  fireEvent.click(screen.getByLabelText(/Incluir la reserva a /));
  rerenderWith(true, [line({ bookingId: "a", previewFingerprint: "new" })]);
  expect(screen.getByLabelText(/Incluir la reserva a /)).not.toBeChecked();
  expect(generateButton()).toBeDisabled();
});


it("reservas terminadas solamente muestran el estado vacío sin aviso de devolución", () => {
  setup([line({ bookingId: "ended", customerName: "Cliente terminado", eligible: false, reason: "booking_ended" })]);
  expect(screen.getByText("Sin períodos disponibles")).toBeInTheDocument();
  expect(screen.getByText("Períodos disponibles:").parentElement).toHaveTextContent("0");
  expect(screen.queryByText("Cliente terminado")).not.toBeInTheDocument();
  expect(screen.queryByText(/completa la devolución/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Incluir la reserva/)).not.toBeInTheDocument();
  expect(generateButton()).toBeDisabled();
});

it("filas booking_ended no inflan grupos ni conteos, pero otros bloqueos siguen visibles", () => {
  setup([
    line({ bookingId: "ended", customerId: "ended-customer", customerName: "Cliente terminado", eligible: false, reason: "booking_ended" }),
    line({ bookingId: "pending" }),
    line({ bookingId: "review", eligible: false, reason: "period_overlap_review" }),
  ]);
  expect(screen.queryByText("Cliente terminado")).not.toBeInTheDocument();
  expect(screen.queryByText(/completa la devolución/)).not.toBeInTheDocument();
  expect(screen.getAllByLabelText(/Incluir la reserva/)).toHaveLength(2);
  expect(screen.getByText("Períodos disponibles:").parentElement).toHaveTextContent("1");
  expect(screen.getByRole("region", { name: "Períodos que requieren revisión" })).toHaveTextContent("Cobertura de períodos ambigua");
  fireEvent.click(screen.getByLabelText(/Seleccionar todas de Acme/));
  expect(generateButton()).toHaveTextContent("Generar 1 periodo");
});

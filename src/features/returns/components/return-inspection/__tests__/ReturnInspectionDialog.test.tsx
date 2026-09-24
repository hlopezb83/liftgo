import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/features/bookings";
import { initialReturnInspectionForm, type ReturnInspectionFormValues } from "../../../lib/returnInspectionSchema";
import { ReturnInspectionDialog } from "../ReturnInspectionDialog";

const onRetry = vi.fn();
const onClose = vi.fn();

function Harness({ loading = false, error = false, rows = [] as Booking[] }) {
  const form = useForm<ReturnInspectionFormValues>({ defaultValues: initialReturnInspectionForm });
  return (
    <ReturnInspectionDialog
      open onOpenChange={onClose} form={form} activeBookings={rows} bookingsRaw={rows}
      bookingsLoading={loading} bookingsError={error} bookingsRetrying={false}
      onRetryBookings={onRetry} requestedBookingId="bk-1" isEarlyReturn
      forkliftMap={new Map()} isPending={false} onSubmit={vi.fn()}
    />
  );
}

describe("ReturnInspectionDialog · preparación", () => {
  it("explica la reserva no elegible sin mostrar un formulario que fallaría", () => {
    render(<Harness />);
    expect(screen.getByText("Esta reserva no está disponible para devolución")).toBeInTheDocument();
    expect(screen.getByText(/tener una entrega completada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar Devolución" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fecha de Inspección/)).not.toBeInTheDocument();
  });

  it("distingue la carga de un resultado vacío", () => {
    render(<Harness loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Comprobando reservas disponibles");
    expect(screen.queryByText(/no está disponible para devolución/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar Devolución" })).not.toBeInTheDocument();
  });

  it("oculta datos obsoletos y permite reintentar después de un error", () => {
    render(<Harness error rows={[{ id: "bk-1", start_date: "2026-09-01", end_date: "2026-09-10" } as Booking]} />);
    expect(screen.getByText("No se pudo cargar las reservas disponibles")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Completar Devolución" })).not.toBeInTheDocument();
  });
});

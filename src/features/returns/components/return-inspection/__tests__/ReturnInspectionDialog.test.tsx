import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/features/bookings";
import { zodResolver } from "@/lib/forms/zodResolver";
import { initialReturnInspectionForm, returnInspectionSchema, type ReturnInspectionFormValues } from "../../../lib/returnInspectionSchema";
import { ReturnInspectionDialog } from "../ReturnInspectionDialog";

const onRetry = vi.fn();
const onClose = vi.fn();
const onSubmit = vi.fn();
vi.mock("@/components/forms/DragDropImageUploader", () => ({ DragDropImageUploader: () => null }));

function Harness({ loading = false, error = false, rows = [] as Booking[], serverError = false }) {
  const form = useForm<ReturnInspectionFormValues>({
    defaultValues: { ...initialReturnInspectionForm, bookingId: rows[0]?.id ?? "" },
    resolver: zodResolver(returnInspectionSchema),
  });
  useEffect(() => {
    if (serverError) form.setError("root.server", { message: "La reserva cambió; revisa los datos" });
  }, [form, serverError]);
  return (
    <ReturnInspectionDialog
      open onOpenChange={onClose} form={form} activeBookings={rows} bookingsRaw={rows}
      bookingsLoading={loading} bookingsError={error} bookingsRetrying={false}
      onRetryBookings={onRetry} requestedBookingId="bk-1" isEarlyReturn
      forkliftMap={new Map()} isPending={false} onSubmit={form.handleSubmit(onSubmit)}
    />
  );
}

describe("ReturnInspectionDialog · preparación", () => {
  it("explica la reserva no elegible sin mostrar un formulario que fallaría", () => {
    render(<Harness />);
    expect(screen.getByText("Esta reserva no está disponible para devolución")).toBeInTheDocument();
    expect(screen.getByText(/tener una entrega real completada/)).toBeInTheDocument();
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

  it("marca combustible obligatorio y bloquea el envío con un mensaje inline", async () => {
    render(<Harness rows={[{ id: "bk-1", forklift_id: "fk-1", start_date: "2000-01-01", end_date: "2100-01-01" } as Booking]} />);
    const fuel = screen.getByRole("combobox", { name: "Nivel de Combustible" });
    fireEvent.click(screen.getByRole("button", { name: "Completar Devolución" }));
    expect(await screen.findByText("Selecciona el nivel de combustible")).toBeInTheDocument();
    expect(fuel).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra el rechazo servidor dentro del formulario", async () => {
    render(<Harness serverError rows={[{ id: "bk-1", forklift_id: "fk-1", start_date: "2000-01-01", end_date: "2100-01-01" } as Booking]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("La reserva cambió; revisa los datos");
    expect(screen.getByRole("button", { name: "Completar Devolución" })).toBeInTheDocument();
  });
});

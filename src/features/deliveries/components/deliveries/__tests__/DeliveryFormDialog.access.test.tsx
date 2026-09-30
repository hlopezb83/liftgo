import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UseFormReturn } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryFormDialog } from "../DeliveryFormDialog";

const access = vi.hoisted(() => ({ canWrite: false, mutate: vi.fn(), notify: vi.fn() }));

vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: (message: string) => access.notify(message) }));
vi.mock("../DeliveryFormFields", () => ({
  DeliveryFormFields: ({ form }: { form: UseFormReturn<{ forkliftId: string; bookingId: string; driverName: string; alreadyCompleted: boolean }> }) => (
    <><button type="button" onClick={() => {
      form.setValue("forkliftId", "f-1");
      form.setValue("bookingId", "b-1");
      form.setValue("driverName", "Diego");
      form.setValue("alreadyCompleted", true);
    }}>Ya se realizó</button><button type="button" onClick={() => {
      form.setValue("forkliftId", "f-1");
      form.setValue("bookingId", "b-1");
      form.setValue("driverName", "Diego");
    }}>Elegir reserva</button></>
  ),
}));

vi.mock("@/features/users", () => ({
  useHasModuleAccess: () => access.canWrite,
}));
vi.mock("@/features/bookings", () => ({
  useConfirmedBookingsForDelivery: () => ({ data: { pages: [[]] }, isLoading: false, isFetchingNextPage: false, isError: false, hasNextPage: false, fetchNextPage: vi.fn() }),
}));
vi.mock("@/features/fleet", () => ({
  useActiveDrivers: () => ({ data: [] }),
  useForklift: () => ({ data: null }),
  useForkliftMap: () => ({ forklifts: [] }),
}));
vi.mock("../../../hooks/useDeliveries", () => ({
  useCreateDelivery: () => ({ isPending: false, mutate: access.mutate }),
}));

describe("DeliveryFormDialog access", () => {
  beforeEach(() => { access.canWrite = false; access.mutate.mockReset(); access.notify.mockReset(); });

  it("no muestra el formulario aunque se solicite abierto para un auditor", () => {
    render(<DeliveryFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Programar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mantiene la acción disponible para usuarios con acceso completo", () => {
    access.canWrite = true;
    render(<DeliveryFormDialog />);
    expect(screen.getByRole("button", { name: "Programar" })).toBeInTheDocument();
  });

  it("confirma como completado un transporte histórico", async () => {
    access.canWrite = true;
    access.mutate.mockImplementation((_payload, options) => options.onSuccess());
    render(<DeliveryFormDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Programar" }));
    expect(screen.getByRole("dialog", { name: "Programar transporte" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ya se realizó" }));
    expect(screen.getByRole("dialog", { name: "Registrar transporte realizado" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar como completado" }));
    await waitFor(() => expect(access.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }), expect.any(Object),
    ));
    expect(access.notify).toHaveBeenCalledWith("Transporte registrado como completado");
  });

  it("conserva el mensaje programado para un transporte futuro", async () => {
    access.canWrite = true;
    access.mutate.mockImplementation((_payload, options) => options.onSuccess());
    render(<DeliveryFormDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Programar" }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Programar" }));
    await waitFor(() => expect(access.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "scheduled" }), expect.any(Object),
    ));
    expect(access.notify).toHaveBeenCalledWith("Transporte programado");
  });
});

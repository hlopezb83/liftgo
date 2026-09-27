import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nowMty } from "@/lib/utils";
import type { Booking } from "@/features/bookings";
import { useReturnInspectionDialog } from "../useReturnInspectionDialog";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), setSearchParams: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "auditor@liftgo.com", user_metadata: { full_name: "Auditor" } } }),
}));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "auditor" }) }));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [new URLSearchParams("booking_id=bk-1&early=1&keep=1"), mocks.setSearchParams],
}));
vi.mock("../../useReturnInspections", () => ({
  useCreateReturnInspection: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyValidation: vi.fn() }));

const booking = {
  id: "bk-1", forklift_id: "fk-1", status: "confirmed",
  start_date: "2026-09-01", end_date: "2026-09-30",
} as Booking;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("useReturnInspectionDialog", () => {
  it("no abre ni envía inspecciones para un rol de lectura", async () => {
    const { result, rerender } = renderHook(
      ({ canWrite }) => useReturnInspectionDialog([booking], canWrite),
      { initialProps: { canWrite: false } },
    );
    act(() => result.current.openNew());
    expect(result.current.dialogOpen).toBe(false);
    act(() => result.current.form.setValue("bookingId", booking.id));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).not.toHaveBeenCalled();
    rerender({ canWrite: true });
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
  });

  it("abre el contexto de una reserva no disponible para explicar el bloqueo", () => {
    const { result } = renderHook(() => useReturnInspectionDialog([], true));
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.form.getValues("bookingId")).toBe("bk-1");
  });

  it("impide enviar una reserva que dejó de estar disponible", async () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useReturnInspectionDialog(rows, true), { initialProps: { rows: [booking] } },
    );
    rerender({ rows: [] });
    act(() => result.current.form.setValue("fuelLevel", "1/2"));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState("bookingId").error?.message).toContain("ya no está disponible");
  });

  it("rechaza una inspección anterior al inicio de renta", async () => {
    const { result } = renderHook(() => useReturnInspectionDialog([booking], true));
    act(() => {
      result.current.form.setValue("inspectedAt", new Date(2026, 7, 31));
      result.current.form.setValue("fuelLevel", "1/2");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState("inspectedAt").error?.message).toContain("inicio de la renta");
  });

  it("conserva el día de Monterrey al enviar y limpia el contexto después del éxito", async () => {
    const { result } = renderHook(() => useReturnInspectionDialog([booking], true));
    act(() => {
      result.current.form.setValue("inspectedAt", new Date(2026, 8, 10));
      result.current.form.setValue("fuelLevel", "1/2");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ inspected_at: "2026-09-10T06:00:00.000Z", booking_id: "bk-1" }),
      expect.any(Object),
    );
    act(() => mocks.mutate.mock.calls[0][1].onSuccess());
    expect(result.current.dialogOpen).toBe(false);
    const [params, options] = mocks.setSearchParams.mock.calls[0];
    expect(params.toString()).toBe("keep=1");
    expect(options).toEqual({ replace: true });
  });

  it("refresca la fecha al abrir y conserva el borrador cuando llegan reservas", () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useReturnInspectionDialog(rows, true), { initialProps: { rows: [booking] } },
    );
    act(() => result.current.form.setValue("hoursUsed", "12"));
    rerender({ rows: [{ ...booking, customer_name: "Cliente actualizado" }] });
    expect(result.current.form.getValues("hoursUsed")).toBe("12");
    vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
    act(() => result.current.openNew());
    expect(result.current.form.getValues("inspectedAt").getTime()).toBe(nowMty().getTime());
  });
});

describe("useReturnInspectionDialog · rechazo y borrador", () => {
  it.each([null, undefined])("bloquea una reserva sin unidad (%s) antes de enviar y conserva el borrador", async (forkliftId) => {
    const unassigned = { ...booking, forklift_id: forkliftId } as unknown as Booking;
    const { result } = renderHook(() => useReturnInspectionDialog([unassigned], true));
    act(() => {
      result.current.form.setValue("hoursUsed", "2.5");
      result.current.form.setValue("fuelLevel", "1/2");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState("bookingId").error?.message).toContain("no tiene un montacargas asignado");
    expect(result.current.form.getValues("hoursUsed")).toBe("2.5");
    expect(result.current.dialogOpen).toBe(true);
  });

  it("bloquea combustible vacío antes de invocar la mutación y conserva las horas", async () => {
    const { result } = renderHook(() => useReturnInspectionDialog([booking], true));
    act(() => result.current.form.setValue("hoursUsed", "2.5"));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState("fuelLevel").error?.message).toBe("Selecciona el nivel de combustible");
    expect(result.current.form.getValues("hoursUsed")).toBe("2.5");
  });

  it("mantiene un rechazo servidor inline sin cerrar el diálogo ni borrar datos", async () => {
    const { result } = renderHook(() => {
      const dialog = useReturnInspectionDialog([booking], true);
      return { ...dialog, errors: dialog.form.formState.errors };
    });
    act(() => {
      result.current.form.setValue("hoursUsed", "2.5");
      result.current.form.setValue("fuelLevel", "1/2");
    });
    await act(async () => { await result.current.handleSubmit(); });
    act(() => mocks.mutate.mock.calls[0][1].onError(new Error("La reserva cambió; revisa los datos")));
    expect(result.current.errors.root?.server?.message).toContain("La reserva cambió");
    expect(result.current.form.getValues("hoursUsed")).toBe("2.5");
    expect(result.current.dialogOpen).toBe(true);
  });
});

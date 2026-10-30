import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import type { BookingFormData } from "../../lib/bookingFormSchema";
import BookingForm from "../BookingForm";

const mocks = vi.hoisted(() => ({
  onSubmit: vi.fn(), navigate: vi.fn(), busy: false, blocked: false, error: null as string | null,
  customerName: "Cliente sintético",
}));
vi.mock("@/features/customers", () => ({ CustomerSelector: () => <div>Selector de cliente</div> }));
vi.mock("@/features/fleet", () => ({ ForkliftSelector: () => <div>Selector de equipo</div>, ForkliftAvailabilityHelp: () => null }));
vi.mock("../../components/bookings/BookingDraftNotice", () => ({ BookingDraftNotice: () => null }));
vi.mock("../../components/bookings/BookingPostDialogs", () => ({ BookingPostDialogs: () => null }));
vi.mock("../../hooks/bookingForm/useBookingFormLogic", () => ({
  useBookingFormLogic: () => {
    const dateRange = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 7) };
    const form = useForm<BookingFormData>({ defaultValues: { date_range: dateRange, forklift_id: "equipment-1", customer_id: "customer-1", customer_name: mocks.customerName, customer_contact: "", recurring_billing: false } });
    return {
      form, customers: [{ id: "customer-1", name: "Cliente sintético" }], createBooking: { isPending: mocks.busy }, draft: { submitBlocked: mocks.blocked },
      isSubmitting: false, submitError: mocks.error, dateRange, forkliftId: "equipment-1",
      availableForklifts: [], datesSelected: true, availabilityLoading: false, availabilityError: false,
      availabilityFetching: false, revalidateAvailability: vi.fn(), onSubmit: mocks.onSubmit,
      postBooking: null, showPolicyDialog: false, handleDeliveryDone: vi.fn(), handlePolicyDone: vi.fn(),
      selectedForklift: { name: "Equipo sintético" }, dateRangeError: undefined, navigate: mocks.navigate,
    };
  },
}));

function renderPage() {
  return render(<TestRouter initialEntries={["/bookings/new"]} path="/bookings/new"><BookingForm /></TestRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.busy = false;
  mocks.blocked = false;
  mocks.error = null;
  mocks.customerName = "Cliente sintético";
});

describe("BookingForm review and actions", () => {
  it("resuelve el cliente seleccionado cuando el borrador no guarda el nombre libre", async () => {
    mocks.customerName = "";
    renderPage();
    expect(await screen.findByText("Cliente sintético")).toBeVisible();
    expect(screen.queryByText("Sin cliente")).not.toBeInTheDocument();
  });

  it("conserva una sola acción de envío y pasa la captura existente", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Resumen de reserva" })).toBeVisible();
    expect(screen.getByText("Equipo sintético")).toBeVisible();
    expect(screen.getByText("Cliente sintético")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Crear reserva" })).toHaveLength(1);
    const submit = screen.getByRole("button", { name: "Crear reserva" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ forklift_id: "equipment-1", customer_id: "customer-1" }), "Equipo sintético");
  });

  it.each(["busy", "blocked"] as const)("conserva el bloqueo %s", async (state) => {
    mocks[state] = true;
    renderPage();
    const submit = await screen.findByRole("button", { name: state === "busy" ? /Guardando/ : "Crear reserva" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(mocks.onSubmit).not.toHaveBeenCalled();
  });

  it("mantiene el error visible y Cancelar usa el retorno existente", async () => {
    mocks.error = "No pudimos verificar la disponibilidad. Intenta de nuevo.";
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(mocks.error);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.navigate).toHaveBeenCalledWith(-1);
  });
});

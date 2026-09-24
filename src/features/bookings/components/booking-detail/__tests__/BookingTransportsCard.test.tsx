import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { BookingTransportsCard } from "../BookingTransportsCard";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/features/users", () => ({
  useHasModuleAccess: () => access.allowed,
}));

const deliveries = [
  { id: "delivery-1", delivery_number: "ENT-0001", type: "delivery", status: "scheduled", scheduled_date: "2026-11-09", scheduled_time: "10:30:00" },
  { id: "pickup-1", delivery_number: "ENT-0002", type: "pickup", status: "cancelled", scheduled_date: "2026-11-13", scheduled_time: null },
];
const props = { deliveries, isLoading: false, isError: false, isRetrying: false, onRetry: vi.fn() };

beforeEach(() => {
  access.allowed = true;
  vi.clearAllMocks();
});

describe("BookingTransportsCard", () => {
  it("permite abrir el transporte exacto y distingue tipos, estados y horas", async () => {
    render(<TestRouter><BookingTransportsCard {...props} /></TestRouter>);
    expect(await screen.findByRole("link", { name: "Abrir ENT-0001" })).toHaveAttribute("href", "/deliveries/delivery-1");
    expect(screen.getByRole("link", { name: "Abrir ENT-0002" })).toHaveAttribute("href", "/deliveries/pickup-1");
    expect(screen.getByText("Entrega")).toBeInTheDocument();
    expect(screen.getByText("Recolección")).toBeInTheDocument();
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.getByText("09/11/2026 · 10:30")).toBeInTheDocument();
    expect(screen.getByText(/Sin hora asignada/)).toBeInTheDocument();
  });

  it("conserva el resumen sin ofrecer una ruta sin permiso", async () => {
    access.allowed = false;
    render(<TestRouter><BookingTransportsCard {...props} /></TestRouter>);
    expect(await screen.findByText("ENT-0001")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("un error no se presenta como ausencia de transportes y permite reintentar", async () => {
    render(<TestRouter><BookingTransportsCard {...props} deliveries={undefined} isError /></TestRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/aún no tiene transportes/)).not.toBeInTheDocument();
  });

  it("distingue una reserva vacía de una consulta pendiente", async () => {
    const view = render(<TestRouter><BookingTransportsCard {...props} deliveries={undefined} isLoading /></TestRouter>);
    expect(await screen.findByRole("status", { name: "Cargando transportes" })).toBeInTheDocument();
    expect(screen.queryByText(/aún no tiene transportes/)).not.toBeInTheDocument();
    view.unmount();
    render(<TestRouter><BookingTransportsCard {...props} deliveries={[]} /></TestRouter>);
    expect(await screen.findByText(/aún no tiene transportes registrados/)).toBeInTheDocument();
  });
});

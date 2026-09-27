import { forwardRef, type AnchorHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingWithForklift } from "@/types/rental";
import PendingReturnsPage from "../PendingReturnsPage";

let canWrite = true;
const booking = { id: "b-1", booking_number: "RSV-0005", end_date: "2026-09-20",
  customer_name: "Logística Álamo del Norte, S.A. de C.V.", forklifts: { name: "MTY-LG-2602" } } as BookingWithForklift;
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => canWrite }));
vi.mock("../../hooks/usePendingReturns", () => ({ usePendingReturns: () => ({ data: [booking], isLoading: false, isError: false }) }));
vi.mock("@/components/dataTable/v2", () => ({ useLiftgoTable: () => ({}) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/layout/ListPageLayout", () => ({
  ListPageLayout: ({ mobileCardRender }: { mobileCardRender: (b: BookingWithForklift) => React.ReactNode }) => mobileCardRender(booking),
}));
// Conserva semántica nativa de enlaces; el router se valida en su propia suite.
vi.mock("@/lib/router-compat-ui", () => ({
  Link: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>(
    ({ to, children, ...props }, ref) => <a href={to} ref={ref} {...props}>{children}</a>),
}));

beforeEach(() => { canWrite = true; });

describe("retornos pendientes en tarjetas", () => {
  it("ofrece enlaces independientes a reserva y captura, sin controles anidados", () => {
    const { container } = render(<PendingReturnsPage />);
    const detail = screen.getByRole("link", { name: "Ver reserva RSV-0005" });
    const capture = screen.getByRole("link", { name: "Registrar devolución" });
    expect(detail).toHaveAttribute("href", "/bookings/b-1");
    expect(capture).toHaveAttribute("href", "/returns?booking_id=b-1");
    expect(detail).not.toContainElement(capture);
    expect(container.querySelector("a a, a button, button a")).toBeNull();
    detail.focus();
    expect(detail).toHaveFocus();
    capture.focus();
    expect(capture).toHaveFocus();
  });

  it("el auditor puede abrir la reserva y no recibe acciones de captura", () => {
    canWrite = false;
    render(<PendingReturnsPage />);
    expect(screen.getByRole("link", { name: "Ver reserva RSV-0005" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Registrar devolución" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar devolución" })).not.toBeInTheDocument();
  });
});

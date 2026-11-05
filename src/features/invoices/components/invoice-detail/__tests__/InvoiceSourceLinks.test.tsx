import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BookingWithForklift } from "@/features/bookings";
import { InvoiceSourceLinks } from "../InvoiceSourceLinks";

vi.mock("@/lib/router-compat-ui", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

const booking = (over: Partial<BookingWithForklift> = {}) => ({
  id: "f94fee07-cdcf-404b-8fd7-2b660de31849",
  booking_number: "RSV-0006",
  start_date: "2026-01-01",
  end_date: "2026-01-31",
  forklifts: { name: "MCAPC025A048/003" },
  ...over,
}) as unknown as BookingWithForklift;

describe("InvoiceSourceLinks", () => {
  it("muestra folio primero, luego equipo y fechas, con enlace al detalle", () => {
    render(<InvoiceSourceLinks sourceBooking={booking()} />);
    const link = screen.getByRole("link");
    expect(link.textContent).toMatch(/^RSV-0006 · MCAPC025A048\/003 · /);
    expect(link.getAttribute("href")).toBe("/bookings/f94fee07-cdcf-404b-8fd7-2b660de31849");
  });

  it("enlaza cada una de varias reservas a su propio detalle", () => {
    render(<InvoiceSourceLinks sourceBookings={[booking(), booking({ id: "b2", booking_number: "RSV-0007" })]} />);
    expect(screen.getByText("Generada desde 2 reservas:")).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["/bookings/f94fee07-cdcf-404b-8fd7-2b660de31849", "/bookings/b2"]);
  });

  it("omite el equipo faltante y usa «Reserva» sin folio", () => {
    render(<InvoiceSourceLinks sourceBooking={booking({ booking_number: null, forklifts: null } as never)} />);
    const text = screen.getByRole("link").textContent ?? "";
    expect(text.startsWith("Reserva · ")).toBe(true);
    expect(text.split(" · ")).toHaveLength(2);
  });

  it("permite ajuste de línea sin desbordamiento", () => {
    render(<InvoiceSourceLinks sourceBooking={booking()} />);
    const badge = screen.getByText(/RSV-0006/);
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });

  it("conserva el enlace de cotización", () => {
    render(<InvoiceSourceLinks sourceQuote={{ id: "q1", quote_number: "COT-0001" }} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/quotes/q1");
  });
});

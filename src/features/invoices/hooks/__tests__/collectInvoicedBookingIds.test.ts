import { describe, it, expect } from "vitest";
import { collectInvoicedBookingIds } from "@/features/invoices/hooks/useInvoiceFormLogic";

describe("collectInvoicedBookingIds", () => {
  // El hook `useAllInvoiceBookings` (v7.320.3) ya filtra server-side las filas
  // cuyo invoice está cancelado, así que aquí solo llegan filas de facturas
  // activas (pagadas/pendientes). Simulamos ese contrato.
  const nonCancelledPivot = [
    { booking_id: "bk-paid", invoice_id: "inv-paid" },
    { booking_id: "bk-multi", invoice_id: "inv-paid-2" },
  ];

  it("excluye reservas ligadas a una factura activa solo vía pivote (Bug A)", () => {
    // Sin booking_id directo en invoices; solo el pivote la captura.
    const invoices = [{ status: "paid", booking_id: null }];
    const set = collectInvoicedBookingIds(invoices, nonCancelledPivot, undefined);
    expect(set.has("bk-paid")).toBe(true);
    expect(set.has("bk-multi")).toBe(true);
  });

  it("NO excluye reservas cuyo único pivote es una factura cancelada (Bug B)", () => {
    // La reserva `bk-cancelled` estaría en el pivote de una cancelada, pero el
    // hook ya la filtró server-side → no llega a `allInvoiceBookings`.
    // Por tanto no se excluye y puede re-facturarse.
    const invoices: { status: string; booking_id?: string | null }[] = [
      { status: "cancelled", booking_id: "bk-cancelled" },
    ];
    const set = collectInvoicedBookingIds(invoices, [], undefined);
    expect(set.has("bk-cancelled")).toBe(false);
  });

  it("no excluye la reserva de la factura que se está editando", () => {
    const invoices = [{ status: "paid", booking_id: "bk-direct" }];
    const pivot = [
      { booking_id: "bk-editing", invoice_id: "inv-editing" },
      { booking_id: "bk-other", invoice_id: "inv-other" },
    ];
    const set = collectInvoicedBookingIds(invoices, pivot, "inv-editing");
    expect(set.has("bk-editing")).toBe(false); // es la propia → no se excluye
    expect(set.has("bk-other")).toBe(true);
    expect(set.has("bk-direct")).toBe(true);
  });

  it("excluye una reserva presente en pivote de una activa aunque también esté en una cancelada (vía directa)", () => {
    // bk-shared: directa en una cancelada (no cuenta) + pivote en una pagada (cuenta).
    const invoices: { status: string; booking_id?: string | null }[] = [
      { status: "cancelled", booking_id: "bk-shared" },
    ];
    const pivot = [{ booking_id: "bk-shared", invoice_id: "inv-paid" }];
    const set = collectInvoicedBookingIds(invoices, pivot, undefined);
    expect(set.has("bk-shared")).toBe(true); // la activa del pivote la mantiene excluida
  });

  it("sin datos devuelve un set vacío", () => {
    expect(collectInvoicedBookingIds(undefined, undefined, undefined).size).toBe(0);
    expect(collectInvoicedBookingIds([], [], undefined).size).toBe(0);
  });
});

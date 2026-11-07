import { describe, expect, it } from "vitest";
import { buildInvoiceSaveRequest, buildInvoiceSaveRpcArgs, readSavedInvoice, type SaveInvoiceWithBookingsArgs } from "../invoiceSaveContract";

const payload = { customer_id: "customer-1", subtotal: 10, total: 10 } as SaveInvoiceWithBookingsArgs["payload"];
const saved = { id: "invoice-1", invoice_number: "BORRADOR-1", version: 3, total: 10 };

describe("invoice save RPC contract", () => {
  it("preserves booking order and the full payload without mutating inputs", () => {
    const bookingIds = Object.freeze(["booking-2", "booking-1"]);
    const result = buildInvoiceSaveRpcArgs({ payload: Object.freeze(payload), bookingIds: bookingIds as unknown as string[] });
    expect(result).toEqual({ p_invoice: payload, p_booking_ids: bookingIds, p_invoice_id: undefined, p_expected_version: undefined });
  });
  it.each([undefined, null, ""])("keeps the ordinary overload when damage is %s", (damageId) => {
    expect(buildInvoiceSaveRpcArgs({ payload, bookingIds: [], invoiceId: null, expectedVersion: null, damageId })).toEqual({
      p_invoice: payload, p_booking_ids: [], p_invoice_id: undefined, p_expected_version: undefined,
    });
  });
  it("selects the damage overload using explicit nulls", () => {
    expect(buildInvoiceSaveRpcArgs({ payload, bookingIds: [], damageId: "damage-1" })).toEqual({
      p_invoice: payload, p_booking_ids: [], p_invoice_id: null, p_expected_version: null, p_damage_id: "damage-1",
    });
  });
  it.each([undefined, "damage-1"])("preserves edit identity and version for overload %s", (damageId) => {
    expect(buildInvoiceSaveRpcArgs({ payload, bookingIds: [], invoiceId: "invoice-1", expectedVersion: 0, damageId })).toMatchObject({
      p_invoice_id: "invoice-1", p_expected_version: 0,
    });
  });
  it("accepts the existing singleton-array and object responses without dropping columns", () => {
    expect(readSavedInvoice([saved])).toBe(saved);
    expect(readSavedInvoice(saved, "invoice-1")).toBe(saved);
  });
  it.each([undefined, null, [], {}, [null], [[saved]], [saved, saved], { ...saved, id: " " }, { ...saved, invoice_number: 12 }])(
    "rejects malformed confirmation %j with an uncertain-outcome message", (response) => {
      expect(() => readSavedInvoice(response)).toThrow("Revisa la lista de facturas antes de volver a intentar");
    },
  );
  it("rejects a mismatched edit identity", () => {
    expect(() => readSavedInvoice(saved, "other-id")).toThrow("No se pudo confirmar");
  });
});

describe("atomic invoice source transport", () => {
  it("retains the old RPC for ordinary and damage-only saves", () => {
    for (const damageId of [undefined, "damage-1"]) {
      const args = { payload, bookingIds: [], damageId };
      expect(buildInvoiceSaveRequest(args)).toEqual({ name: "save_invoice_with_bookings", args: buildInvoiceSaveRpcArgs(args) });
    }
  });
  it("sends all source transaction arguments explicitly", () => {
    expect(buildInvoiceSaveRequest({ payload, bookingIds: ["b-1"], damageId: "damage-1", extensionId: "ext-1", acceptQuoteId: "quote-1", quoteExpectedVersion: 4 })).toEqual({
      name: "save_invoice_with_sources", args: { p_invoice: payload, p_booking_ids: ["b-1"], p_invoice_id: null, p_expected_version: null, p_damage_id: "damage-1", p_extension_id: "ext-1", p_accept_quote_id: "quote-1", p_quote_expected_version: 4 },
    });
  });
  it.each([{ extensionId: "ext-1" }, { acceptQuoteId: "quote-1" }])("does not fall back when only one source is present", (source) => {
    const request = buildInvoiceSaveRequest({ payload, bookingIds: [], ...source });
    expect(request.name).toBe("save_invoice_with_sources");
    expect(request.args).toMatchObject({ p_invoice_id: null, p_expected_version: null, p_damage_id: null, p_quote_expected_version: null });
  });
});

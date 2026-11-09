import { describe, expect, it } from "vitest";
import { resolveBusinessBlock } from "../businessBlocks";
import { translatePgError } from "@/lib/errors/pgErrorCatalog";

describe("sale duplicate invoice explanation", () => {
  it("recognizes the actual PostgREST trigger message without a constraint property", () => {
    const error = { code: "23505", message: "Esta cotización de venta ya tiene una factura activa. Continúa el borrador existente o revisa su cancelación antes de crear otra.", details: null, hint: null };
    expect(resolveBusinessBlock(error)).toMatchObject({ code: "quote_sale_already_invoiced", nextStep: expect.stringContaining("factura existente") });
  });
  it("recognizes the named constraint and translates it without exposing database internals", () => {
    const error = { code: "23505", message: 'violates unique constraint "sale_quote_active_invoice_unique"' };
    expect(resolveBusinessBlock(error)?.code).toBe("quote_sale_already_invoiced");
    expect(translatePgError(error).message).toContain("factura activa");
  });
  it("does not classify unrelated unique violations as a sale duplicate", () => {
    expect(resolveBusinessBlock({ code: "23505", message: "unrelated duplicate key" })).toBeNull();
  });
});

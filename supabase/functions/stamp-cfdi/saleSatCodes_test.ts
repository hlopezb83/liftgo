import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildInvoicePayload } from "./invoicePayload.ts";
import { validateSaleSatCodes } from "./saleSatCodes.ts";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const fiscal = {
  receptor_rfc: "AAA010101AA1",
  receptor_regimen_fiscal: "601",
  receptor_domicilio_fiscal_cp: "64000",
};
const explicit = { clave_prod_serv: "24101600", clave_unidad: "H87" };

for (const field of ["clave_prod_serv", "clave_unidad"]) {
  for (const value of [undefined, null, "", " \t", 123]) {
    Deno.test(`sale SAT presence: rejects ${field}=${JSON.stringify(value)}`, () => {
      const invoice = {
        ...fiscal,
        line_items: [{ ...explicit, line_kind: "sale", [field]: value }],
      };
      const before = structuredClone(invoice);
      assertEquals(validateSaleSatCodes(invoice).ok, false);
      const result = buildInvoicePayload({ invoiceId, invoice });
      assertEquals(result.ok, false);
      if (result.ok) throw new Error("Sale fallback unexpectedly accepted");
      assertEquals(result.status, 422);
      assertEquals(invoice, before);
    });
  }
}

for (const line_items of [undefined, null, {}, [], [null], ["sale"]]) {
  Deno.test(`sale quote rejects absent/malformed concepts: ${JSON.stringify(line_items)}`, () => {
    const result = buildInvoicePayload({
      invoiceId,
      invoice: { ...fiscal, line_items },
      saleSatContext: { isSaleQuote: true },
    });
    assertEquals(result.ok, false);
    if (result.ok) throw new Error("Malformed sale unexpectedly accepted");
    assertEquals(result.status, 422);
  });
}

Deno.test("source-only sale context cannot fall back in the pure builder", () => {
  const result = buildInvoicePayload({
    invoiceId,
    invoice: { ...fiscal, line_items: [{ source_quote_id: sourceId }] },
    saleSatContext: { saleSourceQuoteIds: [sourceId] },
  });
  assertEquals(result.ok, false);
});

Deno.test("pure sale builder preserves explicit historical codes without blacklist", () => {
  const invoice = {
    ...fiscal,
    line_items: [
      { ...explicit, line_kind: "sale" },
      { line_kind: "sale", clave_prod_serv: "78181500", clave_unidad: "DAY" },
      { line_kind: "sale", clave_prod_serv: "78101803", clave_unidad: "E48" },
    ],
  };
  const before = structuredClone(invoice);
  const result = buildInvoicePayload({ invoiceId, invoice });
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("Explicit codes unexpectedly rejected");
  const products =
    (result.payload.items as Array<{ product: Record<string, unknown> }>)
      .map(({ product }) => [product.product_key, product.unit_key]);
  assertEquals(products, [["24101600", "H87"], ["78181500", "DAY"], [
    "78101803",
    "E48",
  ]]);
  assertEquals(invoice, before);
});

Deno.test("rental fallback is unchanged beside an explicitly classified sale", () => {
  const result = buildInvoicePayload({
    invoiceId,
    invoice: {
      ...fiscal,
      line_items: [{ description: "Renta" }, {
        ...explicit,
        line_kind: "sale",
      }],
    },
  });
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("Mixed invoice rejected");
  const products =
    (result.payload.items as Array<{ product: Record<string, unknown> }>)
      .map(({ product }) => [product.product_key, product.unit_key]);
  assertEquals(products, [["78101803", "E48"], ["24101600", "H87"]]);
});

Deno.test("persisted selection marker gates an otherwise unlinked manual line", () => {
  const invoice = {
    ...fiscal,
    line_items: [{ line_kind: "manual", sat_selection_required: true }],
  };
  const before = structuredClone(invoice);
  assertEquals(buildInvoicePayload({ invoiceId, invoice }).ok, false);
  assertEquals(invoice, before);
  const explicitInvoice = {
    ...fiscal,
    line_items: [{
      ...explicit,
      line_kind: "manual",
      sat_selection_required: true,
    }],
  };
  const result = buildInvoicePayload({ invoiceId, invoice: explicitInvoice });
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("Explicit marked line rejected");
  const items = result.payload.items as Array<
    { product: Record<string, unknown> }
  >;
  assertEquals([items[0].product.product_key, items[0].product.unit_key], [
    "24101600",
    "H87",
  ]);
  assertEquals(explicitInvoice.line_items[0].line_kind, "manual");
});

for (const marker of [null, "true", "false", 1, 0, {}]) {
  Deno.test(`corrupt SAT selection marker fails closed: ${JSON.stringify(marker)}`, () => {
    const invoice = {
      ...fiscal,
      line_items: [{ ...explicit, sat_selection_required: marker }],
    };
    const checked = validateSaleSatCodes(invoice);
    assertEquals(checked.ok, false);
    if (checked.ok) throw new Error("Corrupt marker unexpectedly accepted");
    assertEquals(checked.code, "SAT_SELECTION_MARKER_INVALID");
    assertEquals(buildInvoicePayload({ invoiceId, invoice }).ok, false);
  });
}

Deno.test("false marker cannot override a sale classification", () => {
  const invoice = {
    ...fiscal,
    line_items: [{ line_kind: "sale", sat_selection_required: false }],
  };
  assertEquals(buildInvoicePayload({ invoiceId, invoice }).ok, false);
});

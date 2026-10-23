import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildInvoicePayload } from "./invoicePayload.ts";
import snapshots from "./test/invoicePayload.snapshots.json" with {
  type: "json",
};
import { validationCases } from "./test/invoiceValidationCases.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

for (const snapshot of snapshots) {
  Deno.test(`pure invoice payload matches baseline: ${snapshot.name}`, () => {
    const invoice = structuredClone(snapshot.invoice);
    const before = structuredClone(invoice);
    const built = buildInvoicePayload({ invoiceId: INVOICE_ID, invoice });
    assertEquals(built.ok, true);
    if (!built.ok) throw new Error("Unexpected validation failure");
    assertEquals(JSON.parse(JSON.stringify(built.payload)), snapshot.expected);
    assertEquals(invoice, before, "mapper must not mutate the loaded invoice");
  });
}

for (const scenario of validationCases) {
  Deno.test(`pure invoice validation matches baseline: ${scenario.name}`, () => {
    assertEquals(
      buildInvoicePayload({ invoiceId: INVOICE_ID, invoice: scenario.invoice }),
      {
        ok: false,
        status: scenario.status,
        error: scenario.error,
        claimError: scenario.release ?? scenario.error,
      },
    );
  });
}

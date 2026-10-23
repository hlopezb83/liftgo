// SDK adapter contract tests use only intercepted HTTP, never an external PAC.
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  facturapiOk,
  installFacturapiMock,
  pdfResponse,
  xmlResponse,
} from "../_shared/test/facturapiMock.ts";
import { createInvoiceGateway } from "./invoiceGateway.ts";

for (
  const response of [
    { id: "remote-pending", status: "pending" },
    {
      id: "remote-issued",
      uuid: "55555555-5555-4555-8555-555555555555",
      status: "valid",
      total: 1160,
      series: "A",
      folio_number: 7,
    },
  ]
) {
  Deno.test(`invoice gateway: creation preserves PAC identity ${response.id}`, async () => {
    const pac = installFacturapiMock({
      "/invoices": () => facturapiOk(response),
    });
    try {
      const gateway = createInvoiceGateway("sk_test_fixture_only");
      const payload = {
        type: "I",
        external_id: "synthetic",
        idempotency_key: "synthetic",
      };
      const result = await gateway.create(payload, {
        signal: new AbortController().signal,
      });
      assertEquals(result, response);
      assertEquals(pac.calls.length, 1);
      assertEquals(JSON.parse(pac.calls[0].body!), payload);
    } finally {
      pac.restore();
    }
  });
}

Deno.test("invoice gateway: forwards AbortSignal to the SDK transport", async () => {
  let observedSignal: AbortSignal | undefined;
  const pac = installFacturapiMock({
    "/invoices": (request) => {
      observedSignal = request.signal;
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    },
  });
  try {
    const controller = new AbortController();
    const creating = createInvoiceGateway("sk_test_fixture_only").create({}, {
      signal: controller.signal,
    });
    assertEquals(observedSignal?.aborted, false);
    controller.abort();
    assertEquals(observedSignal?.aborted, true);
    await assertRejects(() => creating);
    assertEquals(pac.calls.length, 1, "creation is not automatically retried");
  } finally {
    pac.restore();
  }
});

Deno.test("invoice gateway: decodes XML and PDF without changing document IDs or bytes", async () => {
  const xml = '<cfdi:Comprobante Nombre="Árbol" />';
  const pdf = new Uint8Array([37, 80, 68, 70, 0, 255]);
  const pac = installFacturapiMock({
    "/invoices/remote-issued/xml": () => xmlResponse(xml),
    "/invoices/remote-issued/pdf": () => pdfResponse(pdf),
  });
  try {
    const gateway = createInvoiceGateway("sk_test_fixture_only");
    assertEquals(await gateway.downloadXml("remote-issued"), xml);
    assertEquals(await gateway.downloadPdf("remote-issued"), pdf);
    assertEquals(pac.calls.map((c) => [c.method, new URL(c.url).pathname]), [
      ["GET", "/v2/invoices/remote-issued/xml"],
      ["GET", "/v2/invoices/remote-issued/pdf"],
    ]);
  } finally {
    pac.restore();
  }
});

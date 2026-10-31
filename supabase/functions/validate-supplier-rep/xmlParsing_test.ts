// No remote test dependency: these checks run with Deno's built-in Node assert.
import { strict as assert } from "node:assert";
import { extractAttr, extractPagoNodes, isWellFormedXml } from "./handler.ts";

const xml = `<c:Comprobante xmlns:c="http://www.sat.gob.mx/cfd/4" xmlns:p="http://www.sat.gob.mx/Pagos20" TipoDeComprobante='P'>
<!-- <c:Emisor Rfc='FAKE'/> --><c:Emisor Rfc='REAL'/>
<c:Complemento><p:Pagos><p:Pago Monto='10'><p:DoctoRelacionado IdDocumento='A'/></p:Pago>
<p:Pago Monto='20'><p:DoctoRelacionado IdDocumento='B'/></p:Pago></p:Pagos></c:Complemento></c:Comprobante>`;

Deno.test("REP XML Edge: same structural paths and payment grouping as server", () => {
  assert.equal(extractAttr(xml, "Emisor", "Rfc"), "REAL");
  assert.equal(extractAttr(xml, "Comprobante", "TipoDeComprobante"), "P");
  assert.deepEqual(extractPagoNodes(xml), [{ monto: 10, doctos: ["A"] }, { monto: 20, doctos: ["B"] }]);
  assert.equal(extractAttr(xml.replace("http://www.sat.gob.mx/cfd/4", "urn:fake"), "Emisor", "Rfc"), null);
});

for (const malformed of ["<a/><b/>", "<a broken=/>", "<a/><![CDATA[bad]]>",
  "<a>\u0000</a>", "<a>&#0;</a>", "<a>&unknown;</a>",
  '<!DOCTYPE a SYSTEM "https://example.invalid/external"><a/>',
  "<a>".repeat(65) + "</a>".repeat(65)]) {
  Deno.test(`REP XML Edge: rejects unsafe input ${JSON.stringify(malformed).slice(0, 60)}`, () => {
    assert.equal(isWellFormedXml(malformed), false);
    assert.deepEqual(extractPagoNodes(malformed), []);
  });
}

"""Verifica archivos locales; sin importar handlers, red ni datos reales."""
import hashlib
import json
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]


class ProvenanceTests(unittest.TestCase):
    def test_originales_y_copias_coinciden_con_digest(self):
        entries = json.loads((BASE / "PROVENANCE.json").read_text())
        self.assertGreater(len(entries), 30)
        for relative, entry in entries.items():
            self.assertEqual(hashlib.sha256((ROOT / entry["source"]).read_bytes()).hexdigest(), entry["source_sha256"])
            self.assertEqual(hashlib.sha256((BASE / "candidate" / relative).read_bytes()).hexdigest(), entry["candidate_sha256"])

    def test_handlers_conservan_logica_excepto_inyeccion_de_fabrica(self):
        entries = json.loads((BASE / "PROVENANCE.json").read_text())
        for name in ["stamp-cfdi", "stamp-payment-complement", "stamp-credit-note", "cancel-cfdi", "download-cfdi", "refresh-cancellation-status"]:
            entry = entries[f"{name}/handler.ts"]
            original = (ROOT / entry["source"]).read_text()
            copy = (BASE / "candidate" / name / "handler.ts").read_text()
            copy = copy.replace('  createQaClient?: typeof createFacturapiClient;\n', '')
            copy = copy.replace('(deps.createQaClient ?? createFacturapiClient)(apiKey)', 'createFacturapiClient(apiKey)')
            self.assertEqual(copy, original)

    def test_cambios_limitados_a_fronteras(self):
        entries = json.loads((BASE / "PROVENANCE.json").read_text())
        self.assertEqual({name for name, entry in entries.items() if entry["changed"]}, {
            "_shared/cors.ts", "_shared/facturapi/client.ts", "stamp-cfdi/invoiceGateway.ts",
            "stamp-credit-note/handler.ts", "stamp-payment-complement/handler.ts",
            "cancel-cfdi/handler.ts", "refresh-cancellation-status/handler.ts",
        })

    def test_gateway_normaliza_solo_fabrica_y_consumo(self):
        entry = json.loads((BASE / "PROVENANCE.json").read_text())["stamp-cfdi/invoiceGateway.ts"]
        copy = (BASE / "candidate/stamp-cfdi/invoiceGateway.ts").read_text()
        copy = copy.replace('import { consumeForClient } from "../../effectGuards.ts";\n', '')
        copy = copy.replace('export function createInvoiceGateway(apiKey: string, factory: typeof createFacturapiClient = createFacturapiClient): InvoiceGateway {', 'export function createInvoiceGateway(apiKey: string): InvoiceGateway {')
        copy = copy.replace('const client = factory(apiKey);', 'const client = createFacturapiClient(apiKey);')
        for method, decoder in [("Xml", "Text"), ("Pdf", "Bytes")]:
            copy = copy.replace(f'await consumeForClient(client,\n        await retryOnFacturapi5xx(() => client.invoices.download{method}(id)), binaryTo{decoder}\n      )', f'await binaryTo{decoder}(\n        await retryOnFacturapi5xx(() => client.invoices.download{method}(id)),\n      )')
        self.assertEqual(copy, (ROOT / entry["source"]).read_text())


if __name__ == "__main__":
    unittest.main()
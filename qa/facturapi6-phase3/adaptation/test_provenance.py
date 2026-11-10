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


if __name__ == "__main__":
    unittest.main()
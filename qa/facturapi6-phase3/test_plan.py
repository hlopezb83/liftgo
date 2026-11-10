"""Comprueba sólo la propuesta local; no ejecuta handlers ni accede a servicios."""
import json
import unittest
from decimal import Decimal
from pathlib import Path


class PlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = json.loads(Path(__file__).with_name("fixtures.json").read_text())
        cls.docs = {d["ref"]: d for d in cls.plan["documents"]}

    def test_tenant_autorizado(self):
        self.assertEqual(self.plan["tenant_id"], "fc2c10e3-278b-4899-8aa1-f802752f1c38")

    def test_modo_test(self):
        self.assertEqual(self.plan["mode"], "test")

    def test_maximo_cuatro_cfdi(self):
        self.assertEqual(self.plan["max_cfdi"], 4)
        self.assertEqual(len(self.docs), 4)
        self.assertCountEqual([d["kind"] for d in self.docs.values()], ["invoice", "invoice", "rep", "credit_note"])

    def test_tope_116_mxn(self):
        self.assertEqual(self.plan["currency"], "MXN")
        self.assertEqual(self.plan["max_document_mxn"], 116)
        for d in self.docs.values():
            amount = Decimal(str(d.get("total_mxn", d.get("payment_amount_mxn"))))
            self.assertGreater(amount, 0)
            self.assertLessEqual(amount, Decimal("116"))

    def test_cantidad_uno(self):
        self.assertEqual(self.plan["line_quantity"], 1)
        for d in self.docs.values():
            if d["kind"] != "rep":
                self.assertEqual(d["quantity"], 1)

    def test_preparacion_apagada_sin_ventana(self):
        self.assertIs(self.plan["enabled"], False)
        self.assertIs(self.plan["shutdown"], True)
        for field in ["run_id", "starts_at", "expires_at"]:
            self.assertIsNone(self.plan[field])

    def test_relaciones_propuestas_y_saldos(self):
        a, rep, nc = (self.docs[k] for k in ["factura_a", "rep_a", "nc_a"])
        self.assertEqual(a["method"], "PPD")
        self.assertEqual(rep["invoice_ref"], "factura_a")
        self.assertEqual(nc["invoice_ref"], "factura_a")
        self.assertEqual(rep["installment"], 1)
        self.assertEqual(rep["cfdi_total_mxn"], 0)
        self.assertEqual(rep["previous_balance_mxn"], a["total_mxn"])
        self.assertEqual(rep["remaining_balance_mxn"], a["total_mxn"] - rep["payment_amount_mxn"])
        self.assertEqual(a["total_mxn"] - rep["payment_amount_mxn"] - nc["total_mxn"], 0)

    def test_cancelacion_sin_quinto_cfdi(self):
        self.assertEqual(self.plan["cancellation"], {"invoice_ref": "factura_b", "motive": "02", "substitution": None})
        self.assertFalse(any(d.get("invoice_ref") == "factura_b" for d in self.docs.values()))

    def test_dos_formatos_por_cada_documento(self):
        self.assertCountEqual(self.plan["downloads"]["formats"], ["pdf", "xml"])
        self.assertCountEqual(self.plan["downloads"]["document_refs"], self.docs.keys())

    def test_importes_propuestos_con_iva(self):
        for d in self.docs.values():
            if d["kind"] != "rep":
                self.assertEqual(Decimal(str(d["base_mxn"])) + Decimal(str(d["vat_mxn"])), Decimal(str(d["total_mxn"])))


if __name__ == "__main__":
    unittest.main()
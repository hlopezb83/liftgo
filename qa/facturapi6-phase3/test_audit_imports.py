"""Pruebas focales con archivos ficticios; ninguna conexión ni ejecución TS."""
import tempfile
import unittest
from pathlib import Path
from audit_imports import audit


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_cierre_multilinea_ciclo_y_digest(self):
        self.write("entry.ts", 'import {\n x,\n y\n} from "./lib.ts";\n')
        self.write("lib.ts", 'export { z } from "./entry.ts";\n')
        result = audit(self.root, ["entry.ts"])
        self.assertEqual(set(result["files"]), {"entry.ts", "lib.ts"})
        self.assertEqual(result["files"]["entry.ts"]["imports"][0]["target"], "lib.ts")
        first = result["files"]["lib.ts"]["sha256"]
        self.write("lib.ts", "export const z = 2;\n")
        self.assertNotEqual(first, audit(self.root, ["entry.ts"])["files"]["lib.ts"]["sha256"])

    def test_dinamicos_y_paquetes_sin_ejecutarlos(self):
        self.write("entry.ts", 'const x = await import("./lazy.ts");\nimport "jsr:@fake/pkg";\nimport y from "npm:fake@1.0.0";\n')
        self.write("lazy.ts", 'throw new Error("NO EJECUTAR");\n')
        result = audit(self.root, ["entry.ts"])
        self.assertTrue(result["files"]["entry.ts"]["imports"][0]["dynamic"])
        self.assertEqual(result["external_specifiers"], ["jsr:@fake/pkg", "npm:fake@1.0.0"])
        self.assertIn("lazy.ts", result["files"])

    def test_faltante_y_escape_sin_lectura(self):
        self.write("entry.ts", 'import "./missing.ts";\nimport "../outside.ts";\n')
        result = audit(self.root, ["entry.ts"])
        self.assertEqual(result["missing_local"], ["missing.ts"])
        self.assertEqual(result["outside_root"], ["../outside.ts"])

    def test_marcadores_solo_lineas_no_valores(self):
        self.write("entry.ts", 'const key = Deno.env.get("FICTICIO_NO_SECRETO");\nDeno.serve(() => {});\nconsole.error(key);\n')
        result = audit(self.root, ["entry.ts"])
        markers = result["files"]["entry.ts"]["markers"]
        self.assertEqual(markers["deno_env"], [1])
        self.assertEqual(markers["serve"], [2])
        self.assertEqual(markers["console"], [3])
        self.assertNotIn("FICTICIO_NO_SECRETO", str(result))


if __name__ == "__main__":
    unittest.main()
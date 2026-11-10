"""Copia local reproducible, sin importar handlers ni servicios; no es ejecutor fiscal."""
import hashlib
import json
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]
sys.path.insert(0, str(BASE))
from audit_imports import audit, ENTRYPOINTS, SNAPSHOT


def prepare():
    inventory = audit(ROOT, ENTRYPOINTS)
    target = BASE / "adaptation" / "candidate"
    # Un solo shared tree: snapshot manda; refresh actual reutiliza ese árbol.
    selected = {}
    for source in inventory["files"]:
        relative = source.split("/supabase/functions/", 1)[-1] if source.startswith(SNAPSHOT) else source.removeprefix("supabase/functions/")
        if relative not in selected or source.startswith(SNAPSHOT):
            selected[relative] = source
    provenance = {}
    for relative, source in sorted(selected.items()):
        raw = (ROOT / source).read_bytes()
        text = raw.decode()
        if relative == "_shared/cors.ts":
            text = '''// CORS interno sin env/top-level Deno; NO es autorización.
export function getCorsHeaders(_req: Request): Record<string, string> { return {}; }
export function handleCors(_req: Request): Response | null { return null; }
'''
        if relative == "_shared/facturapi/client.ts":
            text = text.replace('import * as FacturapiPkg from "facturapi";', 'import * as FacturapiPkg from "facturapi6-preview";\nimport { readQaTestConfig, QaConfigError } from "../../../testConfig.ts";')
            start = text.index('  const { admin, env, organizationId } = input;', text.index('export async function getFacturapiConfigForOrganization'))
            end = text.index('\n}\n', start)
            text = text[:start] + '''  try {
    return await readQaTestConfig(input);
  } catch (error) {
    if (error instanceof QaConfigError) {
      throw new FacturapiConfigError(error.code, error.message, input.organizationId ?? null);
    }
    throw error;
  }''' + text[end:]
            text = text.replace('  return new Facturapi(apiKey);', '''  void apiKey;
  // SDK 6 no ofrece fetch por instancia: no conectar hasta revisar transporte.
  throw new Error("QA_TRANSPORT_BLOCKED");''')
        if relative in {
            "stamp-credit-note/handler.ts", "stamp-payment-complement/handler.ts",
            "cancel-cfdi/handler.ts", "refresh-cancellation-status/handler.ts",
        }:
            # Sólo dependencia opcional; fábrica por defecto permanece bloqueada.
            text = text.replace('  fetchImpl: typeof fetch;', '  createQaClient?: typeof createFacturapiClient;\n  fetchImpl: typeof fetch;', 1)
            text = text.replace('const client = createFacturapiClient(apiKey);', 'const client = (deps.createQaClient ?? createFacturapiClient)(apiKey);')
        if relative == "stamp-cfdi/invoiceGateway.ts":
            text = 'import { consumeForClient } from "../../effectGuards.ts";\n' + text
            text = text.replace('export function createInvoiceGateway(apiKey: string): InvoiceGateway {', 'export function createInvoiceGateway(apiKey: string, factory: typeof createFacturapiClient = createFacturapiClient): InvoiceGateway {')
            text = text.replace('const client = createFacturapiClient(apiKey);', 'const client = factory(apiKey);')
            text = text.replace('await binaryToText(\n        await retryOnFacturapi5xx(() => client.invoices.downloadXml(id)),\n      )', 'await consumeForClient(client,\n        await retryOnFacturapi5xx(() => client.invoices.downloadXml(id)), binaryToText\n      )')
            text = text.replace('await binaryToBytes(\n        await retryOnFacturapi5xx(() => client.invoices.downloadPdf(id)),\n      )', 'await consumeForClient(client,\n        await retryOnFacturapi5xx(() => client.invoices.downloadPdf(id)), binaryToBytes\n      )')
        if relative == "download-cfdi/handler.ts":
            text = 'import { consumeStoredForClient } from "../../effectGuards.ts";\n' + text
            text = text.replace('): Promise<Blob | null> {', '): Promise<Uint8Array | null> {', 1)
            text = text.replace('  return data ?? null;', '  return data ? await consumeStoredForClient(supabase, data) : null;', 1)
            text = text.replace('"download-cfdi: facturapi error detail:",\n    res.detail.slice(0, 500),', '"download-cfdi: facturapi error",\n    { status: res.status },', 1)
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text)
        provenance[relative] = {
            "source": source,
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "candidate_sha256": hashlib.sha256(text.encode()).hexdigest(),
            "changed": text.encode() != raw,
        }
    (BASE / "adaptation" / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n")


if __name__ == "__main__":
    prepare()
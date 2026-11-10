import { test, expect } from "bun:test";
import { Facturapi, binaryToBytes, binaryToText } from "./candidate/_shared/facturapi/client";
import { prepareOfficialCalls, type OfficialClient } from "./officialCalls";

function setup() {
  // Constructor oficial intacto; request se sustituye sólo en esta instancia
  // ficticia de test, nunca fetch global ni el SDK instalado.
  const client = new Facturapi("sk_test_FICTICIO_NO_UTILIZABLE") as OfficialClient;
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  let open = true;
  const controller = new AbortController();
  client.invoices.client.request = async (path, options = {}) => {
    calls.push({ path, options });
    return { status: "valid", id: "FICTICIO" };
  };
  const scope = { checkpoint() { if (!open) throw new Error("VENTANA_CERRADA"); }, signal: controller.signal };
  return { client, calls, scope, controller, expire() { open = false; }, gated: prepareOfficialCalls(client, scope) };
}

test("seis métodos oficiales preservan rutas, verbos, payload y señal por llamada", async () => {
  const f = setup();
  const payload = { type: "I", items: [{ quantity: 1, price: 116 }] };
  await f.gated.create(payload);
  await f.gated.cancel("falso/1", { motive: "02" });
  await f.gated.retrieve("falso/1");
  await f.gated.refresh("falso/1");
  await f.gated.pdf("falso/1");
  await f.gated.xml("falso/1");
  expect(f.calls.map((c) => [c.path, c.options.method])).toEqual([
    ["/invoices", "POST"], ["/invoices/falso%2F1", "DELETE"],
    ["/invoices/falso%2F1", "GET"], ["/invoices/falso%2F1/status", "PUT"],
    ["/invoices/falso%2F1/pdf", "GET"], ["/invoices/falso%2F1/xml", "GET"],
  ]);
  expect(f.calls[0]?.options.body).toBe(payload);
  expect(f.calls[1]?.options.params).toEqual({ motive: "02" });
  for (const call of f.calls) expect(call.options.signal).toBe(f.controller.signal);
  expect(f.calls[0]?.options.datePlan).toBeDefined();
});

test("ventana cerrada bloquea los seis métodos antes de request", async () => {
  const f = setup(); f.expire();
  for (const operation of [() => f.gated.create({}), () => f.gated.cancel("x", {}), () => f.gated.retrieve("x"), () => f.gated.refresh("x"), () => f.gated.pdf("x"), () => f.gated.xml("x")]) {
    await expect(operation()).rejects.toThrow("VENTANA_CERRADA");
  }
  expect(f.calls.length).toBe(0);
});

test("abort previo bloquea request", async () => {
  const f = setup(); f.controller.abort();
  await expect(f.gated.create({})).rejects.toThrow();
  expect(f.calls.length).toBe(0);
});

test("vencimiento durante request no inicia siguiente operación ni retorna éxito", async () => {
  const f = setup();
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let count = 0;
  f.client.invoices.client.request = async () => { count++; await pending; return { id: "FICTICIO" }; };
  const result = f.gated.create({});
  f.expire(); release?.();
  await expect(result).rejects.toThrow("VENTANA_CERRADA");
  await expect(f.gated.xml("x")).rejects.toThrow("VENTANA_CERRADA");
  expect(count).toBe(1); // enviada = incierta; no se promete deshacerla.
});

test("fallo de escritura no se reintenta", async () => {
  const f = setup(); let count = 0;
  f.client.invoices.client.request = async () => { count++; throw new Error("RESPUESTA_INCIERTA_FICTICIA"); };
  await expect(f.gated.create({})).rejects.toThrow("RESPUESTA_INCIERTA_FICTICIA");
  expect(count).toBe(1);
});

test("dos scopes no mezclan señales ni mutan el resource original", async () => {
  const f = setup(); const original = f.client.invoices.client;
  const other = new AbortController();
  const b = prepareOfficialCalls(f.client, { checkpoint() {}, signal: other.signal });
  await Promise.all([f.gated.pdf("a"), b.xml("b")]);
  expect(f.calls[0]?.options.signal).toBe(f.controller.signal);
  expect(f.calls[1]?.options.signal).toBe(other.signal);
  expect(f.client.invoices.client).toBe(original);
  expect(Object.hasOwn(original, "signal")).toBe(false);
});

test("consumo tardío de PDF no autoriza persistencia posterior", async () => {
  const f = setup(); let saved = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const blobLike = { async arrayBuffer() { await pending; return new Uint8Array([37, 80, 68, 70]).buffer; } };
  const result = f.gated.consume(blobLike, binaryToBytes).then(() => { saved++; });
  f.expire(); release?.();
  await expect(result).rejects.toThrow("VENTANA_CERRADA");
  expect(saved).toBe(0);
});

test("decodificación PDF/XML usa helpers auténticos", async () => {
  const f = setup();
  expect(await f.gated.consume(new Uint8Array([37, 80, 68, 70]), binaryToBytes)).toEqual(new Uint8Array([37, 80, 68, 70]));
  expect(await f.gated.consume(new Blob(["<cfdi:FICTICIO/>" ]), binaryToText)).toBe("<cfdi:FICTICIO/>");
});

test("transporte incompatible no cae a llamada sin señal", () => {
  const f = setup();
  expect(() => prepareOfficialCalls({ invoices: {} } as OfficialClient, f.scope)).toThrow("QA_TRANSPORT_BLOCKED");
});

test("comparación lado a lado: mismas opciones SDK salvo señal añadida", async () => {
  const gated = setup(); const baseline = setup();
  const a = gated.gated; const b = baseline.client.invoices;
  await a.create({ type: "P" }); await b.create({ type: "P" });
  await a.cancel("x", { motive: "02" }); await b.cancel("x", { motive: "02" });
  await a.retrieve("x"); await b.retrieve("x");
  await a.refresh("x"); await b.updateStatus("x");
  await a.pdf("x"); await b.downloadPdf("x");
  await a.xml("x"); await b.downloadXml("x");
  const normalized = gated.calls.map(({ path, options: { signal: _signal, ...options } }) => ({ path, options }));
  expect(normalized).toEqual(baseline.calls);
  expect(baseline.calls.every((c) => !Object.hasOwn(c.options, "signal"))).toBe(true);
});
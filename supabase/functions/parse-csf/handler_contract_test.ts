import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AiGatewayError } from "../_shared/ai.ts";
import { handleParseCsf, type ParseCsfDependencies } from "./handler.ts";

function fixture() {
  const admin = {};
  const captured: { error: unknown; status?: number }[] = [];
  const calls = { auth: 0, rate: 0, ai: 0 };
  const deps: ParseCsfDependencies<object> = {
    requireRole: (_req, roles) => {
      calls.auth++;
      assertEquals(roles, ["admin", "administrativo", "dispatcher", "ventas"]);
      return Promise.resolve({
        ok: true,
        userId: "verified-actor",
        role: "ventas",
        adminClient: admin,
      });
    },
    enforceRateLimit: (_req, client, bucket, user, count, seconds) => {
      calls.rate++;
      assertStrictEquals(client, admin);
      assertEquals([bucket, user, count, seconds], [
        "parse-csf",
        "verified-actor",
        5,
        60,
      ]);
      return Promise.resolve(null);
    },
    aiChatCompletion: () => {
      calls.ai++;
      return Promise.resolve({ raw: {}, text: null, toolArguments: null });
    },
    setIdentity: () => {},
    capture: (error, status) => captured.push({ error, status }),
  };
  return { deps, calls, captured };
}

const request = (pdf: unknown) =>
  new Request("https://example.invalid/parse-csf", {
    method: "POST",
    headers: { origin: "https://liftgo.lovable.app" },
    body: JSON.stringify({ pdf_base64: pdf }),
  });

Deno.test("CSF contrato: PDF ausente o mayor de 5 MB no llega al gateway", async () => {
  const f = fixture();
  for (
    const [pdf, status] of [[undefined, 400], [
      "a".repeat(Math.ceil(5 * 1024 * 1024 * 4 / 3) + 1),
      413,
    ]] as const
  ) {
    const response = await handleParseCsf(request(pdf), f.deps);
    assertEquals(response.status, status);
    assertEquals(
      response.headers.get("access-control-allow-origin"),
      "https://liftgo.lovable.app",
    );
  }
  assertEquals(f.calls, { auth: 2, rate: 2, ai: 0 });
  assertEquals(f.captured, []);
});

Deno.test("CSF contrato: extracción vacía y status/mensaje del gateway se conservan", async () => {
  const f = fixture();
  const empty = await handleParseCsf(request("synthetic-pdf"), f.deps);
  assertEquals(empty.status, 422);
  assertEquals(await empty.json(), {
    error: "No se pudieron extraer datos del documento",
  });
  assertEquals(f.captured, []);
  for (const status of [402, 429, 504]) {
    const error = new AiGatewayError(
      status,
      "Mensaje de prueba del gateway",
      "Cuerpo sintético",
    );
    f.deps.aiChatCompletion = () => Promise.reject(error);
    const response = await handleParseCsf(request("synthetic-pdf"), f.deps);
    assertEquals(response.status, status);
    assertEquals(await response.json(), {
      error: "Mensaje de prueba del gateway",
    });
    assertStrictEquals(f.captured.at(-1)?.error, error);
    assertEquals(f.captured.at(-1)?.status, status);
  }
});

Deno.test("CSF contrato: fallo previo al gateway conserva 500 y entrega el error original al observador", async () => {
  const f = fixture();
  const error = new TypeError("Fallo sintético del limitador");
  f.deps.enforceRateLimit = () => Promise.reject(error);
  const response = await handleParseCsf(request("synthetic-pdf"), f.deps);
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "Error interno del servidor" });
  assertEquals(f.calls.ai, 0);
  assertEquals(f.captured.length, 1);
  assertStrictEquals(f.captured[0].error, error);
  assertEquals(f.captured[0].status, 500);
});

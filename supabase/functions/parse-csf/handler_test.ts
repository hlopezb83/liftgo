import { strict as assert } from "node:assert";
import { AiGatewayError } from "../_shared/ai.ts";
import { ACTOR_A, memoryObserver } from "../_shared/edgeSentryTestHelpers.ts";
import { handleParseCsf, type ParseCsfDependencies } from "./handler.ts";

function fixture() {
  const observer = memoryObserver();
  const calls = { auth: 0, rate: 0, ai: 0 };
  const deps: ParseCsfDependencies<object> = {
    requireRole: () => {
      calls.auth++;
      return Promise.resolve({
        ok: true,
        userId: ACTOR_A,
        email: "private@example.invalid",
        role: "admin",
        adminClient: {},
      });
    },
    enforceRateLimit: () => {
      calls.rate++;
      return Promise.resolve(null);
    },
    aiChatCompletion: (options) => {
      calls.ai++;
      assert.ok(JSON.stringify(options).includes("PDF-PRIVATE-CONTENT"));
      return Promise.resolve({
        raw: "private-ai-response",
        text: null,
        toolArguments: {
          name: "Private Company",
          regimen_fiscal: "601 - General de Ley",
        },
      });
    },
    setIdentity: observer.setIdentity,
    capture: observer.capture,
  };
  const handler = observer.wrap(
    "parse-csf",
    (req) => handleParseCsf(req, deps),
  );
  return { observer, calls, deps, handler };
}
function pdfRequest() {
  return new Request("https://example.invalid/parse-csf", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://liftgo.lovable.app",
    },
    body: JSON.stringify({ pdf_base64: "PDF-PRIVATE-CONTENT" }),
  });
}

Deno.test("CSF: éxito conserva extracción/régimen; PDF y prompt no generan telemetría", async () => {
  const f = fixture();
  try {
    const response = await f.handler(pdfRequest());
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://liftgo.lovable.app",
    );
    assert.deepEqual(await response.json(), {
      name: "Private Company",
      regimen_fiscal: "601",
    });
    assert.deepEqual(f.calls, { auth: 1, rate: 1, ai: 1 });
    assert.equal(f.observer.events.length, 0);
  } finally {
    await f.observer.close();
  }
});

Deno.test("CSF: OPTIONS, denegación, rate limit y PDF inválido terminan antes de AI", async () => {
  const f = fixture();
  try {
    assert.equal(
      (await f.handler(
        new Request("https://example.invalid/parse-csf", { method: "OPTIONS" }),
      )).status,
      200,
    );
    assert.equal(f.calls.auth, 0);
    f.deps.requireRole = () =>
      Promise.resolve({
        ok: false,
        response: new Response(null, { status: 403 }),
      });
    assert.equal((await f.handler(pdfRequest())).status, 403);
    f.deps.requireRole = () =>
      Promise.resolve({
        ok: true,
        userId: ACTOR_A,
        email: null,
        role: "admin",
        adminClient: {},
      });
    f.deps.enforceRateLimit = () =>
      Promise.resolve(new Response(null, { status: 429 }));
    assert.equal((await f.handler(pdfRequest())).status, 429);
    f.deps.enforceRateLimit = () => Promise.resolve(null);
    assert.equal(
      (await f.handler(
        new Request("https://example.invalid/parse-csf", {
          method: "POST",
          body: "{}",
        }),
      )).status,
      400,
    );
    assert.equal(f.calls.ai, 0);
    assert.equal(f.observer.events.length, 0);
  } finally {
    await f.observer.close();
  }
});

Deno.test("CSF: créditos/429 siguen como diagnóstico local; 5xx AI sí captura sin cuerpo privado", async () => {
  const f = fixture();
  try {
    for (const status of [402, 429, 504]) {
      f.deps.aiChatCompletion = () =>
        Promise.reject(
          new AiGatewayError(
            status,
            "AI-PRIVATE-PROMPT",
            "PDF-PRIVATE-CONTENT sk_test_synthetic_only",
          ),
        );
      const response = await f.handler(pdfRequest());
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: "AI-PRIVATE-PROMPT" });
    }
    assert.equal(f.observer.events.length, 1);
    assert.equal(f.observer.events[0].user?.id, ACTOR_A);
    assert.equal(f.observer.events[0].tags?.organization_id, undefined);
    assert.equal(f.observer.events[0].tags?.http_status, "504");
    assert.doesNotMatch(
      JSON.stringify(f.observer.events),
      /PRIVATE|synthetic_only|example.invalid/,
    );
  } finally {
    await f.observer.close();
  }
});

Deno.test("CSF: excepción inesperada preserva 500/cuerpo genérico y captura una sola vez", async () => {
  const f = fixture();
  try {
    f.deps.aiChatCompletion = () =>
      Promise.reject(new TypeError("Private Company PDF-PRIVATE-CONTENT"));
    const response = await f.handler(pdfRequest());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Error interno del servidor",
    });
    assert.equal(f.observer.events.length, 1);
    assert.equal(f.observer.events[0].exception?.values?.[0].type, "TypeError");
    assert.doesNotMatch(
      JSON.stringify(f.observer.events),
      /Private Company|PDF-PRIVATE-CONTENT/,
    );
  } finally {
    await f.observer.close();
  }
});

// Tests unitarios para los helpers HTTP compartidos.
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsonError, jsonResponse } from "./http.ts";

const ALLOWED = "http://localhost:8080";

function makeReq(origin = ALLOWED) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { Origin: origin },
  });
}

Deno.test("jsonResponse: status 200 por defecto, Content-Type JSON y CORS", async () => {
  const res = jsonResponse(makeReq(), { hello: "world" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
  assertEquals(res.headers.get("Vary"), "Origin");
  const body = await res.json();
  assertEquals(body, { hello: "world" });
});

Deno.test("jsonResponse: respeta init.status y init.headers extra", async () => {
  const res = jsonResponse(makeReq(), { ok: true }, {
    status: 201,
    headers: { "X-Custom": "yes" },
  });
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("X-Custom"), "yes");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  await res.text();
});

Deno.test("jsonError: status + mensaje + extras se serializan", async () => {
  const res = jsonError(makeReq(), 422, "Invalid payload", {
    field: "email",
  });
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body, { error: "Invalid payload", field: "email" });
});

Deno.test("jsonError: origen no permitido no filtra ACAO", async () => {
  const res = jsonError(makeReq("https://evil.example.com"), 401, "nope");
  await res.text();
  // Cuando el origin no está en la allowlist, ACAO queda vacío.
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "");
});

Deno.test("jsonResponse: body null se serializa como 'null'", async () => {
  const res = jsonResponse(makeReq(), null);
  const text = await res.text();
  assertStringIncludes(text, "null");
});

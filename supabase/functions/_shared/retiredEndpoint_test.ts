// Regresión offline: los endpoints retirados nunca ejecutan trabajo privilegiado.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeRetiredEndpointHandler,
  RETIRED_ENDPOINT_CODE,
  RETIRED_ENDPOINT_REPLACEMENTS,
} from "./retiredEndpoint.ts";

const NAMES = [
  "invite-user",
  "invite-customer",
  "delete-user",
  "reset-user-password",
  "toggle-user-status",
];

const ORIGIN = "http://localhost:8080";

Deno.test("retirados: preflight CORS sigue respondiendo 200", () => {
  for (const name of NAMES) {
    const res = makeRetiredEndpointHandler(name)(
      new Request(`https://example.test/${name}`, {
        method: "OPTIONS",
        headers: { Origin: ORIGIN },
      }),
    );
    assertEquals(res.status, 200, name);
  }
});

Deno.test("retirados: POST devuelve 410 con código y reemplazo", async () => {
  for (const name of NAMES) {
    const res = makeRetiredEndpointHandler(name)(
      new Request(`https://example.test/${name}`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: crypto.randomUUID() }),
      }),
    );
    assertEquals(res.status, 410, name);
    const body = await res.json();
    assertEquals(body.code, RETIRED_ENDPOINT_CODE);
    assertEquals(body.replacement, RETIRED_ENDPOINT_REPLACEMENTS[name]);
  }
});

Deno.test("retirados: un bearer válido de admin tampoco reactiva la ruta", async () => {
  for (const name of NAMES) {
    const res = makeRetiredEndpointHandler(name)(
      new Request(`https://example.test/${name}`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          Authorization: "Bearer service-role-o-admin",
        },
        body: JSON.stringify({ user_id: crypto.randomUUID() }),
      }),
    );
    assertEquals(res.status, 410, name);
    const body = await res.json();
    assert(String(body.error).includes(RETIRED_ENDPOINT_CODE));
  }
});

Deno.test("retirados: el cuerpo de la petición nunca se consume", () => {
  const req = new Request("https://example.test/delete-user", {
    method: "POST",
    headers: { Origin: ORIGIN },
    body: JSON.stringify({ user_id: crypto.randomUUID() }),
  });
  makeRetiredEndpointHandler("delete-user")(req);
  assertEquals(req.bodyUsed, false);
});

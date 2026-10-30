// Contratos de los entrypoints migrados a Deno.serve. Se captura el registro
// sin abrir sockets y el SDK real usa exclusivamente un fetch sintético.
import { assert, assertEquals } from "@std/assert";

type Handler = (request: Request) => Response | Promise<Response>;
type Call = { url: URL; method: string; body: unknown };
type Scenario = {
  inactive?: boolean;
  profileError?: boolean;
  noRole?: boolean;
  rate?: false | "error";
  noMembership?: boolean;
  aiStatus?: number;
  aiArguments?: Record<string, unknown>;
};

const ORIGIN = "https://liftgo.lovable.app";
const DATABASE = "https://edge-contract.invalid";
const AI = "https://ai-contract.invalid/completions";
const USER = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "22222222-2222-4222-8222-222222222222";
const SECTIONS = [{ title: "Manual", icon: "Book", content: "Contenido" }];

function jwt(): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
      .replaceAll("=", "");
  // HS256 hace que getClaims verifique mediante getUser. La respuesta Auth
  // es simulada; esta firma no representa una credencial válida de ningún backend.
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: USER,
      email: "actor@example.invalid",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    encode("synthetic-signature"),
  ].join(".");
}

function request(
  endpoint: string,
  method = "POST",
  authorization: string | null = `Bearer ${jwt()}`,
  body: unknown = { pdf_base64: "synthetic-pdf" },
  origin = ORIGIN,
): Request {
  const headers = new Headers({ origin, "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request(`https://entrypoint.invalid/${endpoint}`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD"
      ? {}
      : { body: JSON.stringify(body) }),
  });
}

function syntheticFetch(
  scenario: Scenario,
  calls: Call[],
  unexpected: string[],
) {
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ??
      (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const reply = (value: unknown, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(value), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    if (url.href === AI) {
      if (scenario.aiStatus) {
        return reply({ error: "synthetic" }, scenario.aiStatus);
      }
      return reply({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                arguments: JSON.stringify(
                  scenario.aiArguments ?? { sections: SECTIONS },
                ),
              },
            }],
          },
        }],
      });
    }
    if (url.origin === DATABASE) {
      switch (url.pathname) {
        case "/auth/v1/user":
          return reply({
            id: USER,
            email: "actor@example.invalid",
            aud: "authenticated",
            role: "authenticated",
            created_at: "2026-10-01T00:00:00Z",
          });
        case "/rest/v1/profiles":
          return scenario.profileError
            ? reply({ message: "synthetic profile failure" }, 400)
            : reply({ is_active: !scenario.inactive });
        case "/rest/v1/user_roles":
          return reply(scenario.noRole ? null : { role: "admin" });
        case "/rest/v1/rpc/check_and_record_rate_limit":
          return scenario.rate === "error"
            ? reply({ message: "synthetic rate failure" }, 400)
            : reply(scenario.rate !== false);
        case "/rest/v1/organization_memberships":
          return reply(
            scenario.noMembership
              ? []
              : [{ organization_id: ORGANIZATION, member_type: "internal" }],
          );
        case "/rest/v1/organizations":
          return reply([{ is_active: true }]);
        case "/rest/v1/user_manual":
          return method === "POST"
            ? reply({ id: "synthetic-manual", ...body })
            : reply({ version: "2.0" });
      }
    }
    unexpected.push(url.href);
    return Promise.reject(new Error("Unexpected synthetic fetch target"));
  };
}

Deno.test("entrypoints: registro Deno.serve y contratos sin sockets ni backend", async (t) => {
  const originalServe = Object.getOwnPropertyDescriptor(Deno, "serve")!;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalEnvironment = new Map<string, string | undefined>();
  const environment: Record<string, string> = {
    SENTRY_ENABLED: "0",
    SUPABASE_URL: DATABASE,
    SUPABASE_ANON_KEY: "synthetic-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    LOVABLE_API_KEY: "synthetic-ai-key",
    AI_GATEWAY_ENDPOINT: AI,
  };
  const handlers: Handler[] = [];
  const unexpected: string[] = [];
  let calls: Call[] = [];
  const useScenario = (scenario: Scenario = {}) => {
    calls = [];
    globalThis.fetch = syntheticFetch(scenario, calls, unexpected);
  };
  try {
    for (const [key, value] of Object.entries(environment)) {
      originalEnvironment.set(key, Deno.env.get(key));
      Deno.env.set(key, value);
    }
    Object.defineProperty(Deno, "serve", {
      configurable: originalServe.configurable,
      enumerable: originalServe.enumerable,
      writable: true,
      value: (...args: unknown[]) => {
        assertEquals(args.length, 1);
        assertEquals(typeof args[0], "function");
        handlers.push(args[0] as Handler);
      },
    });
    useScenario();
    console.error = () => {};
    await import("../generate-manual/index.ts");
    assertEquals(
      handlers.length,
      1,
      "generate-manual registra un solo handler",
    );
    await import("../parse-csf/index.ts");
    assertEquals(handlers.length, 2, "parse-csf registra un solo handler");
    assertEquals(calls.length, 0, "el arranque no consume Auth, DB ni AI");
    // El registro vuelve al runtime incluso mientras ejercitamos los callbacks.
    Object.defineProperty(Deno, "serve", originalServe);

    for (
      const [index, endpoint] of ["generate-manual", "parse-csf"].entries()
    ) {
      const handler = handlers[index];
      await t.step(`${endpoint}: CORS precede a autenticación`, async () => {
        useScenario();
        for (const origin of [ORIGIN, "https://untrusted.invalid"]) {
          const response = await handler(
            request(endpoint, "OPTIONS", null, {}, origin),
          );
          assertEquals(response.status, 200);
          assertEquals(await response.text(), "");
          assertEquals(
            response.headers.get("access-control-allow-origin"),
            origin === ORIGIN ? origin : "",
          );
          assertEquals(response.headers.get("vary"), "Origin");
          assert(
            response.headers.get("access-control-allow-headers")?.includes(
              "authorization",
            ),
          );
        }
        assertEquals(calls.length, 0);
      });

      await t.step(
        `${endpoint}: métodos sin sesión conservan 401 JSON`,
        async () => {
          useScenario();
          for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
            for (const authorization of [null, "Basic synthetic"]) {
              const response = await handler(
                request(endpoint, method, authorization),
              );
              assertEquals(response.status, 401);
              assertEquals(await response.json(), { error: "Unauthorized" });
              assertEquals(
                response.headers.get("content-type"),
                "application/json",
              );
              assertEquals(
                response.headers.get("access-control-allow-origin"),
                ORIGIN,
              );
            }
          }
          assertEquals(calls.length, 0);
        },
      );

      await t.step(
        `${endpoint}: cuenta, rol y rate limit fallan cerrados`,
        async () => {
          for (
            const [scenario, status, lastPath] of [
              [{ inactive: true }, 403, "/rest/v1/profiles"],
              [{ profileError: true }, 503, "/rest/v1/profiles"],
              [{ noRole: true }, 403, "/rest/v1/user_roles"],
              [
                { rate: false },
                429,
                "/rest/v1/rpc/check_and_record_rate_limit",
              ],
              [
                { rate: "error" },
                503,
                "/rest/v1/rpc/check_and_record_rate_limit",
              ],
            ] as const
          ) {
            useScenario(scenario);
            const response = await handler(request(endpoint));
            assertEquals(response.status, status);
            assertEquals(
              response.headers.get("access-control-allow-origin"),
              ORIGIN,
            );
            assertEquals(typeof (await response.json()).error, "string");
            assertEquals(calls[0]?.url.pathname, "/auth/v1/user");
            assertEquals(calls.at(-1)?.url.pathname, lastPath);
            assertEquals(
              calls.filter((call) => call.url.href === AI).length,
              0,
            );
            if (scenario.rate !== undefined) {
              assertEquals(calls.at(-1)?.body, {
                _bucket: endpoint,
                _identifier: USER,
                _max_requests: 5,
                _window_seconds: 60,
              });
              assertEquals(
                response.headers.get("retry-after"),
                scenario.rate === false ? "60" : "30",
              );
            }
          }
        },
      );

      await t.step(
        `${endpoint}: error inesperado conserva 500 JSON y CORS`,
        async () => {
          useScenario();
          const req = request(endpoint);
          const get = req.headers.get.bind(req.headers);
          Object.defineProperty(req.headers, "get", {
            value: (name: string) => {
              if (name.toLowerCase() === "authorization") {
                throw new Error("synthetic auth failure");
              }
              return get(name);
            },
          });
          const response = await handler(req);
          assertEquals(response.status, 500);
          assertEquals(await response.json(), {
            error: "Error interno del servidor",
          });
          assertEquals(
            response.headers.get("access-control-allow-origin"),
            ORIGIN,
          );
          assertEquals(calls.length, 0);
        },
      );
    }

    await t.step(
      "generate-manual: organización y respuesta de éxito con SDK real",
      async () => {
        useScenario();
        const response = await handlers[0](request("generate-manual"));
        assertEquals(response.status, 200);
        const result = await response.json();
        assertEquals(result.success, true);
        assertEquals(result.manual.organization_id, ORGANIZATION);
        assertEquals(result.manual.version, "3.0");
        assertEquals(result.manual.content, SECTIONS);
        const membership = calls.find((call) =>
          call.url.pathname.endsWith("/organization_memberships")
        )!;
        assertEquals(
          membership.url.searchParams.get("auth_user_id"),
          `eq.${USER}`,
        );
        assertEquals(
          membership.url.searchParams.get("member_type"),
          "eq.internal",
        );
        const insert = calls.find((call) =>
          call.url.pathname.endsWith("/user_manual") && call.method === "POST"
        )!;
        assertEquals(
          (insert.body as Record<string, unknown>).organization_id,
          ORGANIZATION,
        );
        assertEquals(calls.filter((call) => call.url.href === AI).length, 1);
      },
    );

    await t.step(
      "generate-manual: sin membresía interna no llama AI ni inserta",
      async () => {
        useScenario({ noMembership: true });
        const response = await handlers[0](request("generate-manual"));
        assertEquals(response.status, 403);
        await response.text();
        assertEquals(
          calls.at(-1)?.url.pathname,
          "/rest/v1/organization_memberships",
        );
      },
    );

    await t.step(
      "parse-csf: wiring conserva la extracción y el rate limit",
      async () => {
        useScenario({
          aiArguments: {
            rfc: "XAXX010101000",
            name: "EMPRESA SINTETICA",
            domicilio_fiscal_cp: "01000",
            address: "DOMICILIO SINTETICO",
            regimen_fiscal: "601",
            representante_legal: "PERSONA SINTETICA",
          },
        });
        const response = await handlers[1](request("parse-csf"));
        assertEquals(response.status, 200);
        const result = await response.json();
        assertEquals(result.rfc, "XAXX010101000");
        assertEquals(result.regimen_fiscal, "601");
        assertEquals(calls.filter((call) => call.url.href === AI).length, 1);
        assertEquals(
          calls.find((call) =>
            call.url.pathname.endsWith("/check_and_record_rate_limit")
          )?.body,
          {
            _bucket: "parse-csf",
            _identifier: USER,
            _max_requests: 5,
            _window_seconds: 60,
          },
        );
      },
    );

    await t.step(
      "entrypoints: errores AI conservan status y no guardan manual",
      async () => {
        for (
          const [index, endpoint] of ["generate-manual", "parse-csf"].entries()
        ) {
          for (const status of [402, 429]) {
            useScenario({ aiStatus: status });
            const response = await handlers[index](request(endpoint));
            assertEquals(response.status, status);
            assertEquals(typeof (await response.json()).error, "string");
            assertEquals(
              response.headers.get("access-control-allow-origin"),
              ORIGIN,
            );
            assertEquals(calls.at(-1)?.url.href, AI);
          }
        }
      },
    );
    assertEquals(
      unexpected,
      [],
      "ningún fetch puede salir de los destinos sintéticos",
    );
  } finally {
    Object.defineProperty(Deno, "serve", originalServe);
    globalThis.fetch = originalFetch;
    console.error = originalError;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

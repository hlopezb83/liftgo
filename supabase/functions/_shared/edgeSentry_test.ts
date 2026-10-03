import { strict as assert } from "node:assert";
import * as Sentry from "npm:@sentry/deno@10.76.0";
import {
  ACTOR_A,
  ACTOR_B,
  memoryObserver,
  ORG_A,
  ORG_B,
} from "./edgeSentryTestHelpers.ts";

const request = () =>
  new Request("https://example.invalid/private?token=private-query", {
    headers: {
      authorization: "Bearer private-token",
      cookie: "private-cookie",
    },
  });

Deno.test("edge SDK real: privacidad, error original, actor verificado y un evento por fallo", async () => {
  const observer = memoryObserver();
  const error = new Error(
    "PDF-PRIVATE-CONTENT sk_test_synthetic_only AI-PRIVATE-PROMPT",
  );
  Object.assign(error, {
    bodyText: "private-provider-body",
    csrf: "private-csrf",
  });
  const handler = observer.wrap("parse-csf", () => {
    observer.setIdentity({
      userId: ACTOR_A,
      organizationId: ORG_A,
      role: "admin",
    });
    Sentry.getIsolationScope().setExtra("private", { raw: "private-extra" });
    Sentry.getIsolationScope().setTag("rfc", "PRIVATE-RFC");
    observer.capture(error, 500);
    observer.capture(error, 500);
    return new Response("private-response", { status: 500 });
  });
  try {
    assert.equal((await handler(request())).status, 500);
    assert.equal(observer.events.length, 1);
    const event = observer.events[0];
    assert.equal(event.user?.id, ACTOR_A);
    assert.equal(event.tags?.organization_id, ORG_A);
    assert.equal(event.tags?.http_status, "500");
    assert.deepEqual(event.fingerprint, ["{{ default }}", "parse-csf"]);
    assert.equal(event.request, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.ok(event.exception?.values?.[0].stacktrace?.frames?.length);
    assert.ok(
      event.exception?.values?.[0].stacktrace?.frames?.some((frame) =>
        frame.filename?.endsWith("edgeSentry_test.ts")
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(event),
      /PRIVATE|private-|synthetic_only|Bearer|cookie|prompt|bodyText|authorization/,
    );
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: mismo Error en A/B concurrentes no se mezcla ni suprime; anónimo limpio", async () => {
  const observer = memoryObserver();
  const shared = new Error("shared-private-failure");
  let releaseA!: () => void;
  let releaseB!: () => void;
  const waitA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const waitB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const handler = observer.wrap("parse-csf", async (req) => {
    const a = new URL(req.url).pathname === "/a";
    observer.setIdentity({
      userId: a ? ACTOR_A : ACTOR_B,
      organizationId: a ? ORG_A : ORG_B,
      role: a ? "ventas" : "admin",
    });
    if (a) {
      releaseB();
      await waitA;
    } else {
      releaseA();
      await waitB;
    }
    observer.capture(shared);
    return new Response(null, { status: 500 });
  });
  try {
    await Promise.all([
      handler(new Request("https://example.invalid/a")),
      handler(new Request("https://example.invalid/b")),
    ]);
    assert.equal(observer.events.length, 2);
    for (const event of observer.events) {
      assert.equal(
        event.tags?.organization_id,
        event.user?.id === ACTOR_A ? ORG_A : ORG_B,
      );
    }
    await observer.wrap("parse-csf", () => new Response(null, { status: 500 }))(
      request(),
    );
    assert.equal(observer.events.length, 3);
    assert.equal(observer.events[2].user, undefined);
    assert.equal(observer.events[2].tags?.organization_id, undefined);
    assert.equal(observer.events[2].tags?.role, undefined);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: agrupamiento distingue función y conserva el mismo grupo entre empresas", async () => {
  const observer = memoryObserver();
  const error = new Error("private-shared-wrapper-failure");
  try {
    for (
      const [name, organizationId] of [
        ["parse-csf", ORG_A],
        ["parse-csf", ORG_B],
        ["validate-receptor-tax-info", ORG_A],
      ]
    ) {
      await observer.wrap(name, () => {
        observer.setIdentity({ organizationId });
        observer.capture(error, 500);
        return new Response(null, { status: 500 });
      })(request());
    }
    assert.deepEqual(observer.events.map((event) => event.fingerprint), [
      ["{{ default }}", "parse-csf"],
      ["{{ default }}", "parse-csf"],
      ["{{ default }}", "validate-receptor-tax-info"],
    ]);
    assert.doesNotMatch(
      JSON.stringify(observer.events.map((event) => event.fingerprint)),
      /private|[0-9a-f]{8}-/,
    );
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: 4xx esperado y captura fuera de Request no envían eventos", async () => {
  const observer = memoryObserver();
  try {
    observer.capture(new Error("outside"));
    const handler = observer.wrap("parse-csf", () => {
      observer.capture(
        Object.assign(new Error("private-validation"), { status: 429 }),
      );
      return new Response(null, { status: 429 });
    });
    assert.equal((await handler(request())).status, 429);
    observer.setIdentity({ userId: ACTOR_B, organizationId: ORG_B });
    assert.equal(observer.events.length, 0);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK: inicialización fallida o desactivada ejecuta el negocio una sola vez", async () => {
  let attempts = 0;
  let calls = 0;
  const observer = memoryObserver({
    initialize: () => {
      attempts++;
      throw new Error("sdk-failure");
    },
  });
  const handler = observer.wrap("parse-csf", () => {
    calls++;
    return new Response("unchanged");
  });
  assert.equal(await (await handler(request())).text(), "unchanged");
  await handler(request());
  assert.equal(calls, 2);
  assert.equal(attempts, 1);
  await observer.close();
  const disabled = memoryObserver({
    options: () => undefined,
    initialize: () => {
      throw new Error("must not initialize");
    },
  });
  assert.equal(
    (await disabled.wrap(
      "parse-csf",
      () => new Response(null, { status: 503 }),
    )(request())).status,
    503,
  );
  assert.equal(disabled.events.length, 0);
  await disabled.close();
});

Deno.test("edge SDK real: transporte que falla o se detiene no repite ni bloquea la respuesta", async () => {
  for (const stalled of [false, true]) {
    const observer = memoryObserver({
      options: () => ({
        dsn: "https://public@example.invalid/1",
        transport: () => ({
          send: () =>
            stalled
              ? new Promise<never>(() => {})
              : Promise.reject(new Error("transport-private-error")),
          flush: () =>
            stalled ? new Promise<never>(() => {}) : Promise.resolve(false),
        }),
      }),
    });
    let calls = 0;
    const handler = observer.wrap("parse-csf", () => {
      calls++;
      return new Response("kept", { status: 500 });
    });
    const started = Date.now();
    assert.equal(await (await handler(request())).text(), "kept");
    assert.ok(Date.now() - started < 2000);
    assert.equal(calls, 1);
    await observer.close();
  }
});

Deno.test("edge SDK real: waitUntil recibe el envío sin esperar al transporte en la respuesta", async () => {
  const pending: Promise<unknown>[] = [];
  const observer = memoryObserver({
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });
  try {
    assert.equal(
      (await observer.wrap(
        "parse-csf",
        () => new Response(null, { status: 500 }),
      )(request())).status,
      500,
    );
    assert.equal(pending.length, 1);
    await Promise.all(pending);
    assert.equal(observer.events.length, 1);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: 500 explícito conserva el punto original aunque el error adjunte 404", async () => {
  const observer = memoryObserver();
  const error = Object.assign(new TypeError("private-upstream"), {
    status: 404,
  });
  try {
    const handler = observer.wrap("parse-csf", () => {
      observer.capture(error, 500);
      return new Response(null, { status: 500 });
    });
    await handler(request());
    assert.equal(observer.events.length, 1);
    assert.equal(observer.events[0].tags?.http_status, "500");
    assert.equal(observer.events[0].exception?.values?.[0].type, "TypeError");
    assert.ok(
      observer.events[0].exception?.values?.[0].stacktrace?.frames?.some((
        frame,
      ) => frame.filename?.endsWith("edgeSentry_test.ts")),
    );
  } finally {
    await observer.close();
  }
});

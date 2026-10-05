import { strict as assert } from "node:assert";
import * as Sentry from "@sentry/deno";
import { memoryObserver, ORG_A, ORG_B } from "./edgeSentryTestHelpers.ts";

const request = () => new Request("https://example.invalid/fiscal");

Deno.test("edge SDK: un fallo de contexto antes o después de iniciar no repite la operación", async () => {
  for (const afterStart of [false, true]) {
    const observer = memoryObserver({
      isolate: (work) => {
        if (afterStart) Sentry.withIsolationScope(work);
        throw new Error("telemetry-context-failure");
      },
    });
    let calls = 0;
    try {
      const response = await observer.wrap("stamp-cfdi", async () => {
        calls++;
        await Promise.resolve();
        return new Response("business-result", { status: 202 });
      })(request());
      assert.equal(await response.text(), "business-result");
      assert.equal(response.status, 202);
      assert.equal(calls, 1);
    } finally {
      await observer.close();
    }
  }
});

Deno.test("edge SDK: fallo de contexto conserva la excepción original del negocio", async () => {
  const observer = memoryObserver({
    isolate: () => {
      throw new Error("scope-failure");
    },
  });
  const businessError = new Error("business-failure");
  let calls = 0;
  try {
    await assert.rejects(
      observer.wrap("stamp-cfdi", () => {
        calls++;
        throw businessError;
      })(request()),
      (caught: unknown) => caught === businessError,
    );
    assert.equal(calls, 1);
    assert.equal(observer.events.length, 0);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK: captura fallida permite reintentar el mismo error en su propio contexto", async () => {
  let attempts = 0;
  const observer = memoryObserver({
    captureException: (...args) => {
      if (++attempts === 1) throw new Error("capture-failure");
      return Sentry.captureException(...args);
    },
  });
  const error = new Error("original-failure");
  try {
    await observer.wrap("stamp-cfdi", () => {
      observer.setIdentity({ organizationId: ORG_B });
      observer.capture(error);
      observer.capture(error);
      return new Response(null, { status: 500 });
    })(request());
    assert.equal(attempts, 2);
    assert.equal(observer.events.length, 1);
    assert.equal(observer.events[0].tags?.organization_id, ORG_B);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK: fallo al abrir un trabajo no atribuye el error a la empresa del padre", async () => {
  let scopes = 0;
  const observer = memoryObserver({
    isolate: (work) => {
      if (++scopes === 2) throw new Error("job-scope-failure");
      return Sentry.withIsolationScope(work);
    },
  });
  const businessError = new Error("job-business-failure");
  let calls = 0;
  try {
    await assert.rejects(
      observer.wrap("queue", () => {
        observer.setIdentity({ organizationId: ORG_A });
        return observer.withJob({ organizationId: ORG_B }, () => {
          calls++;
          observer.capture(businessError);
          throw businessError;
        });
      })(request()),
      (caught: unknown) => caught === businessError,
    );
    assert.equal(calls, 1);
    assert.equal(observer.events.length, 0);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK: trabajo sin contexto conserva 500 sin generar un evento de otra empresa", async () => {
  let scopes = 0;
  const observer = memoryObserver({
    isolate: (work) => {
      if (++scopes === 2) throw new Error("job-scope-failure");
      return Sentry.withIsolationScope(work);
    },
  });
  try {
    const response = await observer.wrap("queue", async () => {
      observer.setIdentity({ organizationId: ORG_A });
      await observer.withJob({ organizationId: ORG_B }, () => {
        observer.capture(new Error("job-failure"));
      });
      return new Response("business-error", { status: 500 });
    })(request());
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "business-error");
    assert.equal(observer.events.length, 0);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK: captura fallida de un trabajo no se reintenta bajo la identidad del padre", async () => {
  let attempts = 0;
  const observer = memoryObserver({
    captureException: (...args) => {
      if (++attempts === 1) throw new Error("capture-failure");
      return Sentry.captureException(...args);
    },
  });
  const businessError = new Error("job-business-failure");
  try {
    await assert.rejects(
      observer.wrap("queue", () => {
        observer.setIdentity({ organizationId: ORG_A });
        return observer.withJob({ organizationId: ORG_B }, () => {
          throw businessError;
        });
      })(request()),
      (caught: unknown) => caught === businessError,
    );
    assert.equal(attempts, 1);
    assert.equal(observer.events.length, 0);
  } finally {
    await observer.close();
  }
});

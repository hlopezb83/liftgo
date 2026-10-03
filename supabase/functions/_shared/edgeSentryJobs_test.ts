import { strict as assert } from "node:assert";
import { memoryObserver, ORG_A, ORG_B } from "./edgeSentryTestHelpers.ts";

const request = () => new Request("https://example.invalid/queue");
Deno.test("edge SDK real: trabajos de dos empresas y siguiente trabajo sin empresa tienen scopes propios", async () => {
  const observer = memoryObserver();
  const error = new Error("shared-job-failure");
  const handler = observer.wrap("process-cfdi-retry-queue", async () => {
    observer.setIdentity({ role: "service_role" });
    for (const organizationId of [ORG_A, ORG_B, undefined]) {
      await observer.withJob({ organizationId }, () => observer.capture(error));
    }
    return new Response(null, { status: 500 });
  });
  try {
    await handler(request());
    assert.deepEqual(
      observer.events.map((event) => event.tags?.organization_id),
      [ORG_A, ORG_B, undefined],
    );
    assert.ok(observer.events.every((event) => event.user === undefined));
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: error de un trabajo conserva identidad y se relanza sin duplicar en el padre", async () => {
  const observer = memoryObserver();
  const error = new Error("private-job-throw");
  try {
    const handler = observer.wrap(
      "queue",
      () =>
        observer.withJob({ organizationId: ORG_B }, () => {
          throw error;
        }),
    );
    await assert.rejects(
      handler(request()),
      (caught: unknown) => caught === error,
    );
    assert.equal(observer.events.length, 1);
    assert.equal(observer.events[0].tags?.organization_id, ORG_B);
  } finally {
    await observer.close();
  }
});

Deno.test("edge SDK real: trabajo tardío registra waitUntil después de que el Request respondió", async () => {
  const pending: Promise<unknown>[] = [];
  const observer = memoryObserver({
    waitUntil: (promise) => pending.push(promise),
  });
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let job!: Promise<void>;
  try {
    const handler = observer.wrap("queue", () => {
      job = observer.withJob({ organizationId: ORG_B }, async () => {
        await ready;
        observer.capture(new Error("private-delayed-failure"));
      });
      return new Response(null, { status: 202 });
    });
    assert.equal((await handler(request())).status, 202);
    assert.equal(pending.length, 0);
    finish();
    await job;
    assert.equal(pending.length, 1);
    await Promise.all(pending);
    assert.equal(observer.events.length, 1);
    assert.equal(observer.events[0].tags?.organization_id, ORG_B);
  } finally {
    finish();
    await job;
    await observer.close();
  }
});

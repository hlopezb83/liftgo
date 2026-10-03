import { strict as assert } from "node:assert";
import { runObservedWork } from "./edgeSentryWork.ts";

Deno.test("observación: fallo antes de entrar ejecuta una sola vez la alternativa", async () => {
  let calls = 0;
  const result = await runObservedWork(() => {
    throw new Error("sdk-enter");
  }, () => {
    calls++;
    return "observed";
  }, () => {
    calls++;
    return "preserved";
  });
  assert.equal(result, "preserved");
  assert.equal(calls, 1);
});
Deno.test("observación: fallo después de iniciar no duplica una operación pendiente", async () => {
  let calls = 0;
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const task = runObservedWork((start) => {
    void start();
    throw new Error("sdk-exit");
  }, () => {
    calls++;
    return pending;
  }, () => {
    calls++;
    return "repeated";
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  finish("original-operation");
  assert.equal(await task, "original-operation");
  assert.equal(calls, 1);
});
Deno.test("observación: un rechazo de cleanup no reemplaza el resultado del negocio", async () => {
  let calls = 0;
  const result = await runObservedWork((start) => {
    void start();
    return Promise.reject(new Error("sdk-cleanup"));
  }, () => {
    calls++;
    return "kept";
  });
  assert.equal(result, "kept");
  assert.equal(calls, 1);
});
Deno.test("observación: cleanup detenido no demora un trabajo ya terminado", async () => {
  const result = await runObservedWork((start) => {
    void start();
    return new Promise<never>(() => {});
  }, () => "kept");
  assert.equal(result, "kept");
});
Deno.test("observación: conserva la misma excepción de negocio y nunca reejecuta", async () => {
  const original = new Error("original-business-error");
  let calls = 0;
  const work = () => {
    calls++;
    throw original;
  };
  await assert.rejects(
    runObservedWork((start) => start(), work),
    (error: unknown) => error === original,
  );
  assert.equal(calls, 1);
});
Deno.test("observación: el callback duplicado comparte una sola operación", async () => {
  let calls = 0;
  const result = await runObservedWork((start) => {
    const first = start();
    void start();
    return first;
  }, () => {
    calls++;
    return "once";
  });
  assert.equal(result, "once");
  assert.equal(calls, 1);
});
Deno.test("observación: contexto que invoca tarde conserva la alternativa ya iniciada", async () => {
  let delayed!: () => Promise<string>;
  let calls = 0;
  const result = await runObservedWork((start) => {
    delayed = start;
    return Promise.resolve("sdk-value");
  }, () => {
    calls++;
    return "observed";
  }, () => {
    calls++;
    return "fallback";
  });
  assert.equal(result, "fallback");
  assert.equal(await delayed(), "fallback");
  assert.equal(calls, 1);
});

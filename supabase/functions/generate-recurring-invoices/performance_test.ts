import { deepStrictEqual as equal, match, rejects } from "node:assert/strict";
import {
  createRecurringPerformance,
  type RecurringCounter,
  type RecurringPerformanceSnapshot,
  type RecurringPhase,
} from "./performance.ts";

Deno.test("performance: deterministic aggregate timings and bounded safe counts", async () => {
  let time = 0;
  const logs: RecurringPerformanceSnapshot[] = [];
  const metrics = createRecurringPerformance({
    now: () => time,
    emit: (entry) => logs.push(entry),
  });
  equal(
    await metrics.measure("bookings", () => {
      time = 12.34;
      return Promise.resolve("business-result");
    }),
    "business-result",
  );
  await metrics.measure("bookings", () => {
    time = 18.76;
    return Promise.resolve();
  });
  metrics.count("bookings_rows", 3);
  metrics.count("bookings_rows", 2);
  for (const value of [-1, NaN, Infinity, 0.5]) {
    metrics.count("bookings_rows", value);
  }
  time = 20;
  const headers = metrics.finish("ok");
  equal(headers.serverTiming, "bookings;dur=18.8, total;dur=20");
  match(headers.traceId, /^[0-9a-f-]{36}$/);
  equal(logs.length, 1);
  equal(logs[0].phases, { bookings: { calls: 2, ms: 18.8 } });
  equal(logs[0].counts, { bookings_rows: 5 });
  equal(metrics.finish("error"), headers);
  equal(logs.length, 1);
});

Deno.test("performance: errors retain identity but never enter telemetry", async () => {
  let time = 0;
  const logs: RecurringPerformanceSnapshot[] = [];
  const metrics = createRecurringPerformance({
    now: () => time,
    emit: (entry) => logs.push(entry),
  });
  const error = new Error("private fiscal payload must not be logged");
  await rejects(() =>
    metrics.measure("charges", () => {
      time = 7;
      return Promise.reject(error);
    }), (actual) => actual === error);
  metrics.finish("error");
  equal(logs[0].outcome, "error");
  equal(logs[0].phases, { charges: { calls: 1, ms: 7 } });
  equal(JSON.stringify(logs).includes(error.message), false);
});

Deno.test("performance: runtime allowlists reject arbitrary labels", async () => {
  const logs: RecurringPerformanceSnapshot[] = [];
  const metrics = createRecurringPerformance({
    now: () => 0,
    emit: (entry) => logs.push(entry),
  });
  await metrics.measure(
    "secret-label" as RecurringPhase,
    () => Promise.resolve("private value"),
  );
  metrics.count("secret-label" as RecurringCounter, 5);
  const headers = metrics.finish("ok");
  equal(headers.serverTiming, "total;dur=0");
  equal(logs[0].phases, {});
  equal(logs[0].counts, {});
  equal(JSON.stringify(logs).includes("secret"), false);
});

Deno.test("performance: failing clocks and logging cannot fail the business operation", async () => {
  const metrics = createRecurringPerformance({
    now: () => {
      throw new Error("clock");
    },
    emit: () => {
      throw new Error("logger");
    },
  });
  equal(await metrics.measure("plan", () => Promise.resolve(42)), 42);
  equal(metrics.finish("ok").serverTiming, "plan;dur=0, total;dur=0");
});

Deno.test("performance: concurrent durations are aggregate and trace state is request-local", async () => {
  let time = 0;
  const logs: RecurringPerformanceSnapshot[] = [];
  const metrics = createRecurringPerformance({
    now: () => time,
    emit: (entry) => logs.push(entry),
  });
  let release!: () => void;
  const pending = metrics.measure(
    "fiscal",
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await metrics.measure("history_direct", () => {
    time = 8;
    return Promise.resolve();
  });
  time = 10;
  release();
  await pending;
  const other = createRecurringPerformance({
    now: () => time,
    emit: (entry) => logs.push(entry),
  });
  equal(
    metrics.finish("ok").serverTiming,
    "fiscal;dur=10, history_direct;dur=8, total;dur=10",
  );
  equal(other.finish("ok").serverTiming, "total;dur=0");
  equal(logs[0].traceId === logs[1].traceId, false);
  equal(logs[1].counts, {});
});

Deno.test("performance: backward and non-finite clocks never produce invalid durations", async () => {
  let time = 100;
  const logs: RecurringPerformanceSnapshot[] = [];
  const metrics = createRecurringPerformance({
    now: () => time,
    emit: (entry) => logs.push(entry),
  });
  time = 90;
  await metrics.measure("plan", () => {
    time = NaN;
    return Promise.resolve();
  });
  time = Infinity;
  await metrics.measure("plan", () => {
    time = -Infinity;
    return Promise.resolve();
  });
  time = 120;
  equal(metrics.finish("ok").serverTiming, "plan;dur=0, total;dur=20");
  equal(logs[0].phases, { plan: { calls: 2, ms: 0 } });
});

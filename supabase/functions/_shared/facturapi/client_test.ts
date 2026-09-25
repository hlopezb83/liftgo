import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { binaryToBytes, retryOnFacturapi5xx } from "./client.ts";

Deno.test("lecturas 429 respetan Retry-After breve y difieren uno largo", async () => {
  let calls = 0;
  const short = Object.assign(new Error("rate limit"), {
    status: 429,
    code: "rate_limit_exceeded",
    headers: { "retry-after": "0" },
  });
  const result = await retryOnFacturapi5xx(async () => {
    calls++;
    if (calls === 1) throw short;
    return "ok";
  });
  assertEquals(result, "ok");
  assertEquals(calls, 2);

  calls = 0;
  const long = Object.assign(new Error("rate limit"), {
    status: 429,
    code: "rate_limit_exceeded",
    headers: { "retry-after": "60" },
  });
  try {
    await retryOnFacturapi5xx(async () => {
      calls++;
      throw long;
    });
    throw new Error("expected 429 to be deferred");
  } catch (err) {
    assertEquals(err, long);
  }
  assertEquals(calls, 1);
});

Deno.test("binaryToBytes soporta objeto con body stream", async () => {
  const body = new Response(new Uint8Array([1, 2, 3])).body;
  const bytes = await binaryToBytes({ body });
  assertEquals(Array.from(bytes), [1, 2, 3]);
});

Deno.test("binaryToBytes soporta async iterable", async () => {
  async function* gen() {
    yield new Uint8Array([1, 2]);
    yield new Uint8Array([3]);
  }
  const bytes = await binaryToBytes(gen());
  assertEquals(Array.from(bytes), [1, 2, 3]);
});

Deno.test("binaryToBytes soporta objeto indexado por números", async () => {
  const bytes = await binaryToBytes({ 0: 37, 1: 80, 2: 68 });
  assertEquals(Array.from(bytes), [37, 80, 68]);
});

Deno.test("binaryToBytes soporta objeto con text()", async () => {
  const bytes = await binaryToBytes({ text: () => Promise.resolve("PDF") });
  assertEquals(new TextDecoder().decode(bytes), "PDF");
});

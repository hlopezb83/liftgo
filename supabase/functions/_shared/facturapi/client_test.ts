import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { binaryToBytes } from "./client.ts";

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

import {
  assertEquals,
  assertNotStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { edgeException, expectedEdgeFailure } from "./edgeSentryError.ts";

Deno.test("edge error: un 500 explícito no se oculta por un 4xx adjunto al error", () => {
  const error = Object.assign(new Error("private"), { status: 404 });
  assertEquals(expectedEdgeFailure(error), true);
  assertEquals(expectedEdgeFailure(error, 500), false);
  assertEquals(expectedEdgeFailure(new Error("private"), 429), true);
  assertEquals(expectedEdgeFailure({ status: "429" }), false);
  assertEquals(expectedEdgeFailure({ status: 429.5 }), false);
  assertEquals(expectedEdgeFailure({ status: 503 }), false);
});

Deno.test("edge error: la copia conserva el stack y tipo sin datos ni getter de nombre", () => {
  const error = Object.assign(new TypeError("PDF-PRIVATE-CONTENT"), {
    bodyText: "private-provider-body",
    invoice: { rfc: "private" },
  });
  const copy = edgeException(error);
  assertNotStrictEquals(copy, error);
  assertEquals(copy.name, "TypeError");
  assertEquals(copy.stack, error.stack);
  assertEquals(copy.message, "Cloud operation failed");
  assertEquals(Object.hasOwn(copy, "bodyText"), false);
  assertEquals(Object.hasOwn(copy, "invoice"), false);
  let reads = 0;
  Object.defineProperty(error, "name", {
    get: () => {
      reads++;
      throw new Error("private");
    },
  });
  const guarded = edgeException(error);
  assertEquals(guarded.name, "Error");
  assertEquals(reads, 0);
});

Deno.test("edge error: status accesor no se evalúa y objeto ajeno no se serializa", () => {
  let reads = 0;
  const error = {
    toJSON() {
      throw new Error("must not serialize");
    },
  };
  Object.defineProperty(error, "status", {
    get: () => {
      reads++;
      throw new Error("private");
    },
  });
  assertEquals(expectedEdgeFailure(error), false);
  assertEquals(edgeException(error).message, "Cloud operation failed");
  assertEquals(reads, 0);
});

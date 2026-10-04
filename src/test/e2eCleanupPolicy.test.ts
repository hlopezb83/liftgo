import { describe, expect, it } from "vitest";
import { isShardedRun } from "../../tests/e2e/fixtures/cleanupPolicy";

describe("limpieza global después de todos los shards", () => {
  it("una corrida local sin shards permite limpieza global", () => {
    expect(isShardedRun({}, [])).toBe(false);
  });
  it.each([
    [{ SHARD_INDEX: "4", SHARD_TOTAL: "4" }, []],
    [{ SHARD_INDEX: "1" }, []],
    [{ PLAYWRIGHT_SHARD: "2/4" }, []],
    [{}, ["--shard=4/4"]],
    [{}, ["--shard", "1/4"]],
    [{ E2E_KEEP_SEED_FLAG: "1" }, []],
  ])("ningún índice implica ser el último shard en terminar", (env, argv) => {
    expect(isShardedRun(env, argv)).toBe(true);
  });
});

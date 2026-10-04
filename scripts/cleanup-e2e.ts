/** Invocar una vez después de esperar a TODOS los shards del carril heredado. */
import globalTeardown from "../tests/e2e/global.teardown";
if (process.env.E2E_FINAL_CLEANUP !== "1") {
  throw new Error("Confirma el paso final con E2E_FINAL_CLEANUP=1 después de todos los shards.");
}
await globalTeardown();

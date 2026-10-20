import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.RUN_LOCAL_FISCAL_TESTS !== "1") {
  throw new Error("Opt in with RUN_LOCAL_FISCAL_TESTS=1; this launcher owns a new PostgreSQL cluster.");
}
if (process.env.FISCAL_TEST_DB_URL || process.env.FISCAL_TEST_PORT) {
  throw new Error("An existing fiscal database/port cannot be supplied to this launcher.");
}
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error("PG_BIN must name trusted installed PostgreSQL binaries.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const directory = mkdtempSync(path.join(os.tmpdir(), "liftgo-rep-pg-"));
const server = net.createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const pg = (command, args) => execFileSync(path.join(bin, command), args, { encoding: "utf8", timeout: 30_000 });
let started = false;
try {
  pg("initdb", ["-D", path.join(directory, "data"), "-U", "postgres", "--auth=trust"]);
  pg("pg_ctl", ["-D", path.join(directory, "data"), "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, "start"]);
  started = true;
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "scripts/tests/fiscal/vitest.config.ts"], {
    cwd: root,
    stdio: "inherit",
    timeout: 180_000,
    env: { ...process.env, TZ: "UTC", FISCAL_TEST_PORT: String(port), FISCAL_TEST_CLUSTER: directory },
  });
} finally {
  if (started) pg("pg_ctl", ["-D", path.join(directory, "data"), "-m", "immediate", "stop"]);
  console.log(`Disposable REP cluster stopped. Diagnostics: ${directory}`);
}

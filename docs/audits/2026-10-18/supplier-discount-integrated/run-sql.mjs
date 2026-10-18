import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../../..");
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Use before or after, with an optional candidate path.");
const candidate = process.argv[3] ? resolve(process.argv[3]) : resolve(directory, "baseline-rpc-v3.sql");
if (!candidate.startsWith(resolve(root, "..") + sep)) throw new Error("Candidate must stay inside the task workspace.");
const pgBin = process.env.K1_PG_BIN;
if (!pgBin) throw new Error("Set K1_PG_BIN to the installed PostgreSQL binary directory.");
const local = resolve(root, ".local-pg");
const data = resolve(local, "data-precision");
const tmp = resolve(local, "tmp");
mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TEMP: tmp, TMP: tmp, PGCONNECT_TIMEOUT: "5" };
const database = `liftgo_k1_precision_${phase}_final`;
const connection = ["-X", "-h", "127.0.0.1", "-p", "55442", "-U", "postgres"];
let log = "";
let sequence = 0;
function run(exe, args, allowFailure = false) {
  // On Windows pg_ctl's detached server can retain inherited pipe handles.
  // Real files avoid waiting for those pipes after pg_ctl itself has exited.
  const capture = resolve(tmp, `pgctl-${phase}-${sequence++}.txt`);
  const descriptor = exe === "pg_ctl" ? openSync(capture, "w") : undefined;
  const result = spawnSync(resolve(pgBin, `${exe}.exe`), args, { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 45000,
    ...(descriptor === undefined ? {} : { stdio: ["ignore", descriptor, descriptor] }) });
  if (descriptor !== undefined) closeSync(descriptor);
  const captured = descriptor === undefined ? `${result.stdout ?? ""}${result.stderr ?? ""}` : readFileSync(capture, "utf8");
  log += `${exe} ${args.map((v) => v.startsWith(root) ? `<worktree>${v.slice(root.length)}` : v).join(" ")}\n${captured}\nEXIT=${result.status}\n`;
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${exe} exited ${result.status}`);
  return result;
}
let started = false;
try {
  if (!existsSync(resolve(data, "PG_VERSION"))) run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--locale=C", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", resolve(local, "server-precision.log"), "-o", "-h 127.0.0.1 -p 55442", "-w", "-t", "30", "start"]);
  started = true;
  const identity = JSON.parse(run("psql", [...connection, "-d", "postgres", "-Atq", "-c", "SELECT json_build_object('data_directory',current_setting('data_directory'),'port',inet_server_port(),'address',inet_server_addr())"]).stdout.trim());
  if (resolve(identity.data_directory).toLowerCase() !== data.toLowerCase() || identity.port !== 55442 || identity.address !== "127.0.0.1") throw new Error("Local cluster identity mismatch; no fixture writes allowed.");
  writeFileSync(resolve(directory, `${phase}-target.json`), JSON.stringify({ ...identity, data_directory: "<worktree>/.local-pg/data-precision", database, synthetic: true }, null, 2) + "\n");
  // Never drop or reset a pre-existing DB. A repeated phase requires a new name
  // and deliberate runner review, rather than deleting an unknown target.
  run("createdb", ["-h", "127.0.0.1", "-p", "55442", "-U", "postgres", database]);
  for (const file of [resolve(directory, "baseline-fixture.sql"), candidate, resolve(directory, "cases.sql")]) run("psql", [...connection, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file]);
  const query = "SELECT json_build_object('count',count(*),'passed',count(*) FILTER (WHERE passed),'failed',count(*) FILTER (WHERE NOT passed),'cases',json_agg(to_jsonb(e) ORDER BY id)) FROM public.precision_expectations e";
  const result = JSON.parse(run("psql", [...connection, "-d", database, "-Atq", "-c", query]).stdout.trim());
  const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  result.phase = phase; result.synthetic = true; result.candidate_sha256 = sha(candidate); result.cases_sha256 = sha(resolve(directory, "cases.sql"));
  result.baseline_fixture_sha256 = sha(resolve(directory, "baseline-fixture.sql"));
  writeFileSync(resolve(directory, `${phase}-results.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(`${phase}: ${result.passed}/${result.count} pass, ${result.failed} fail`);
  process.exitCode = result.failed ? 1 : 0;
} catch (error) {
  log += `RUNNER_ERROR: ${error.stack}\n`;
  console.error(error.message);
  process.exitCode = 2;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"], true);
  const status = run("pg_ctl", ["-D", data, "status"], true);
  log += `STOPPED_STATUS_EXPECTED_3=${status.status}\n`;
  writeFileSync(resolve(directory, `${phase}-run.txt`), log.replaceAll(root, "<worktree>").replaceAll(root.replaceAll("\\", "/"), "<worktree>"));
}

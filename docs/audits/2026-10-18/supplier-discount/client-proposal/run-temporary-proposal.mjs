import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const evidence = path.dirname(fileURLToPath(import.meta.url));
const sources = [
  "src/features/accounts-payable/hooks/useSupplierBillMutations.ts",
  "src/lib/rpc.ts",
];
const testPath = "src/features/accounts-payable/hooks/__tests__/useUpdateSupplierBill.rpc.test.tsx";
const paths = [...sources, testPath];
const originals = new Map(paths.map((name) => [name,
  fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name)) : null,
]));
if (originals.get(testPath) !== null) throw new Error(`Refusing to replace an existing ${testPath}`);

const hash = (buffer) => buffer === null ? null : createHash("sha256").update(buffer).digest("hex");
const command = (binary, args, extra = {}) => spawnSync(binary, args, {
  cwd: root, encoding: "utf8", windowsHide: true, ...extra,
});
const git = (args) => {
  const result = command("git", args);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};
const baselineDiff = git(["diff", "--", ...sources]);
if (baselineDiff) throw new Error("Refusing to patch sources that already have local modifications");
const expectedHead = git(["rev-parse", "HEAD"]).trim();
const prefix = process.argv[2] ?? "";
if (prefix && !/^[a-z0-9-]+$/.test(prefix)) throw new Error("Invalid log prefix");
const filename = (name) => path.join(evidence, `${prefix ? `${prefix}-` : ""}${name}`);
const testArgs = ["node_modules/vitest/vitest.mjs", "run", testPath,
  "--pool=forks", "--maxWorkers=1"];
const runTests = (stage) => {
  const result = command(process.execPath, testArgs, {
    env: { ...process.env, CI: "", NO_COLOR: "1", FORCE_COLOR: "0", TZ: "UTC",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline",
      VITE_SUPABASE_PROJECT_ID: "test-offline", SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline", SUPABASE_PROJECT_ID: "test-offline" },
  });
  const report = `WorkingDirectory: ${root}\nHEAD: ${expectedHead}\nCommand: node ${testArgs.join(" ")}\n` +
    `${result.stdout ?? ""}${result.stderr ?? ""}` +
    (result.error ? `\nSpawnError: ${result.error.stack}\n` : "") +
    `\nExitCode: ${result.status}\nSignal: ${result.signal ?? "none"}\n`;
  fs.writeFileSync(filename(`${stage}.txt`), report);
  console.log(`${stage}: exit ${result.status}; log ${filename(`${stage}.txt`)}`);
  return result.status;
};

let before;
let after;
let sourceDiff;
try {
  fs.copyFileSync(path.join(evidence, "useUpdateSupplierBill.rpc.test.tsx"), path.join(root, testPath));
  before = runTests("before");

  const mutationOriginal = originals.get(sources[0]).toString("utf8");
  const newline = mutationOriginal.includes("\r\n") ? "\r\n" : "\n";
  const oldBlock = [
    "      const { error } = await supabase",
    '        .from("supplier_bills")',
    "        .update(patch)",
    '        .eq("id", id);',
    "      if (error) throw error;",
    "      return id;",
  ].join(newline);
  const replacement = [
    '      return callRpc<string>("update_supplier_bill_details", {',
    "        p_bill_id: id,",
    "        p_patch: patch,",
    "      });",
  ].join(newline);
  if (mutationOriginal.split(oldBlock).length !== 2) throw new Error("Mutation source anchor is not unique");
  fs.writeFileSync(path.join(root, sources[0]), mutationOriginal.replace(oldBlock, replacement));

  const rpcOriginal = originals.get(sources[1]).toString("utf8");
  const anchor = '  | "withdraw_my_support_report";';
  if (rpcOriginal.split(anchor).length !== 2) throw new Error("RPC type anchor is not unique");
  fs.writeFileSync(path.join(root, sources[1]), rpcOriginal.replace(anchor,
    `  | "update_supplier_bill_details"${rpcOriginal.includes("\r\n") ? "\r\n" : "\n"}${anchor}`));

  sourceDiff = git(["diff", "--", ...sources]);
  const testDiff = command("git", ["diff", "--no-index", "--", "/dev/null", testPath]);
  if (testDiff.status !== 1 || !testDiff.stdout.includes("new file mode")) {
    throw new Error(`Unable to generate new-test patch: ${testDiff.stderr}`);
  }
  fs.writeFileSync(path.join(evidence, "../proposed-client.patch"), sourceDiff + testDiff.stdout);
  after = runTests("after");
} finally {
  for (const [name, buffer] of originals) {
    const target = path.join(root, name);
    if (buffer === null) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } else fs.writeFileSync(target, buffer);
  }
  const checks = paths.map((name) => {
    const current = fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name)) : null;
    const beforeHash = hash(originals.get(name));
    const afterHash = hash(current);
    return { path: name, before_sha256: beforeHash, restored_sha256: afterHash,
      exact_restore: beforeHash === afterHash };
  });
  const diff = git(["diff", "--", "src"]);
  const status = git(["status", "--short", "--", "src"]);
  const applyCheck = command("git", ["apply", "--check", path.join(evidence, "../proposed-client.patch")]);
  const report = { head: expectedHead, original_sources_restored: checks.every((check) => check.exact_restore),
    checks, src_diff_empty: diff === "", src_status_empty: status === "", src_status: status,
    patch_apply_check_exit: applyCheck.status, patch_apply_check_stderr: applyCheck.stderr,
    test_command: `node ${testArgs.join(" ")}`, before_exit: before, after_exit: after };
  fs.writeFileSync(filename("restoration.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (!report.original_sources_restored || !report.src_diff_empty || !report.src_status_empty || applyCheck.status !== 0) {
    throw new Error("Restoration or patch applicability verification failed; inspect restoration.json");
  }
}
if (before !== 1 || after !== 0) process.exitCode = 1;

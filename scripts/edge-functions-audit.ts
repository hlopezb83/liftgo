import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export interface RemoteFunction {
  name: string;
  version: string | null;
  updatedAt: string | null;
}

export interface FunctionAuditRow extends RemoteFunction {
  classification: "required" | "retired" | "migration-tool" | "global" | "unexpected";
  deployed: boolean;
  sourceStatus: SourceStatus;
  localHash: string | null;
  deployedHash: string | null;
}

export interface AuditPolicy {
  required: string[];
  retired: string[];
  migrationTools: string[];
  global: string[];
}

export type SourceStatus = "match" | "mismatch" | "not-downloaded" | "not-applicable";

const IGNORED_FILES = new Set(["deno.json", "deno.lock", "import_map.json"]);
const IGNORED_PATTERNS = [/[_\.-]test\.[cm]?[jt]sx?$/i, /\.spec\.[cm]?[jt]sx?$/i];

function productionFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const relativePath = relative(root, path).replaceAll("\\", "/");
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else if (
        !IGNORED_FILES.has(basename(path)) &&
        !IGNORED_PATTERNS.some((pattern) => pattern.test(relativePath))
      ) {
        files.push(relativePath);
      }
    }
  };

  visit(root);
  return files;
}

export function hashFunctionSource(root: string): string | null {
  const files = productionFiles(root);
  if (files.length === 0) return null;

  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(join(root, file));
    const normalized = bytes.toString("utf8").replaceAll("\r\n", "\n");
    hash.update(`${file}\0${normalized}\0`);
  }
  return hash.digest("hex");
}

export function normalizeInventory(input: unknown): RemoteFunction[] {
  const record = input as Record<string, unknown> | null;
  const candidates = Array.isArray(input)
    ? input
    : Array.isArray(record?.functions)
      ? record.functions
      : Array.isArray(record?.data)
        ? record.data
        : [];

  return candidates
    .map((value) => value as Record<string, unknown>)
    .map((value) => ({
      name: String(value.name ?? value.slug ?? "").trim(),
      version: value.version == null ? null : String(value.version),
      updatedAt:
        value.updated_at == null && value.updatedAt == null
          ? null
          : String(value.updated_at ?? value.updatedAt),
    }))
    .filter((value) => value.name.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function classification(name: string, policy: AuditPolicy): FunctionAuditRow["classification"] {
  if (policy.required.includes(name)) return "required";
  if (policy.retired.includes(name)) return "retired";
  if (policy.migrationTools.includes(name)) return "migration-tool";
  if (policy.global.includes(name)) return "global";
  return "unexpected";
}

export function auditFunctions(options: {
  repoFunctionsDir: string;
  downloadedFunctionsDir?: string;
  inventory: RemoteFunction[];
  policy: AuditPolicy;
}): {
  rows: FunctionAuditRow[];
  sharedSourceStatus: SourceStatus;
  pass: boolean;
  failures: string[];
} {
  const { repoFunctionsDir, downloadedFunctionsDir, inventory, policy } = options;
  const localNames = readdirSync(repoFunctionsDir)
    .filter((name) => name !== "_shared" && statSync(join(repoFunctionsDir, name)).isDirectory())
    .sort();
  const remote = new Map(inventory.map((item) => [item.name, item]));
  const allNames = [...new Set([...localNames, ...remote.keys()])].sort();
  const localSharedHash = hashFunctionSource(join(repoFunctionsDir, "_shared"));
  const deployedSharedHash = downloadedFunctionsDir
    ? hashFunctionSource(join(downloadedFunctionsDir, "_shared"))
    : null;
  const sharedSourceStatus: SourceStatus = !localSharedHash
    ? "not-applicable"
    : !deployedSharedHash
      ? "not-downloaded"
      : localSharedHash === deployedSharedHash
        ? "match"
        : "mismatch";

  const rows = allNames.map((name): FunctionAuditRow => {
    const deployed = remote.get(name);
    const localHash = localNames.includes(name) ? hashFunctionSource(join(repoFunctionsDir, name)) : null;
    const deployedHash = downloadedFunctionsDir
      ? hashFunctionSource(join(downloadedFunctionsDir, name))
      : null;
    const sourceStatus = !deployed
      ? "not-applicable"
      : !deployedHash
        ? "not-downloaded"
        : localHash === deployedHash
          ? "match"
          : "mismatch";

    return {
      name,
      version: deployed?.version ?? null,
      updatedAt: deployed?.updatedAt ?? null,
      classification: classification(name, policy),
      deployed: Boolean(deployed),
      sourceStatus,
      localHash,
      deployedHash,
    };
  });

  const failures: string[] = [];
  if (sharedSourceStatus !== "not-applicable" && sharedSourceStatus !== "match") {
    failures.push("_shared: deployed shared source is not proven equal to the repository");
  }
  for (const row of rows) {
    if (row.classification === "required" && !row.deployed) {
      failures.push(`${row.name}: required function is not deployed`);
    } else if (row.classification === "required" && row.sourceStatus !== "match") {
      failures.push(`${row.name}: deployed source is not proven equal to the repository`);
    } else if (
      (row.classification === "retired" || row.classification === "migration-tool") &&
      row.deployed &&
      row.sourceStatus !== "match"
    ) {
      failures.push(`${row.name}: sensitive deployed endpoint does not match the safe repository version`);
    } else if (row.classification === "unexpected") {
      failures.push(`${row.name}: deployed or versioned function is not classified`);
    }
  }

  return { rows, sharedSourceStatus, pass: failures.length === 0, failures };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const inventoryPath = argument("--inventory");
  const downloadedFunctionsDir = argument("--downloaded");
  const repoFunctionsDir = argument("--repo") ?? "supabase/functions";
  const policyPath = argument("--policy") ?? "scripts/edge-functions-audit.policy.json";

  if (!inventoryPath) {
    throw new Error("Usage: --inventory <functions.json> [--downloaded <supabase/functions>] [--repo <dir>]");
  }

  const result = auditFunctions({
    repoFunctionsDir,
    downloadedFunctionsDir,
    inventory: normalizeInventory(readJson(inventoryPath)),
    policy: readJson(policyPath) as AuditPolicy,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}


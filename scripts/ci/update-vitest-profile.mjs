import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, "scripts/ci/vitest-ci-profile.json");

function normalizeTestPath(filePath, root = ROOT) {
  const rel = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;
  return rel.split(path.sep).join("/");
}

function roundMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 100;
  return Math.max(100, Math.round(ms / 100) * 100);
}

function median(values) {
  if (values.length === 0) return 1000;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : roundMs((sorted[mid - 1] + sorted[mid]) / 2);
}

export function buildProfileFromReports(reportPaths, root = ROOT) {
  const durations = new Map();
  for (const reportPath of reportPaths) {
    const raw = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const entry of raw.testResults ?? []) {
      if (typeof entry.name !== "string") continue;
      const rel = normalizeTestPath(entry.name, root);
      const elapsed = typeof entry.endTime === "number" && typeof entry.startTime === "number"
        ? entry.endTime - entry.startTime
        : 0;
      const measured = roundMs(elapsed);
      const prev = durations.get(rel);
      durations.set(rel, prev === undefined ? measured : Math.max(prev, measured));
    }
  }
  const files = Object.fromEntries(
    [...durations.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return {
    unknownFileMs: median([...durations.values()]),
    files,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  let outputPath = DEFAULT_OUTPUT;
  const reportPaths = [];
  for (let i = 0; i < args.length; i++) {
    if (i === outIndex) {
      outputPath = path.resolve(args[i + 1]);
      i++;
      continue;
    }
    reportPaths.push(path.resolve(args[i]));
  }
  if (reportPaths.length === 0) {
    console.error("Usage: node scripts/ci/update-vitest-profile.mjs [--out <path>] <vitest-report.json>...");
    process.exit(1);
  }
  const profile = buildProfileFromReports(reportPaths);
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  console.log(
    `Updated ${path.relative(ROOT, outputPath)} with ${Object.keys(profile.files).length} files (unknownFileMs=${profile.unknownFileMs}).`,
  );
}

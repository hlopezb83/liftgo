import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditFunctions,
  hashFunctionSource,
  normalizeInventory,
  type AuditPolicy,
} from "../../scripts/edge-functions-audit";

const policy: AuditPolicy = {
  required: ["active"],
  retired: ["retired"],
  migrationTools: ["migration"],
  global: ["global"],
};

function functionDir(root: string, name: string, source: string) {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.ts"), source);
  return directory;
}

describe("edge function deployment audit", () => {
  it("normalizes the CLI JSON fields without retaining project identifiers", () => {
    expect(
      normalizeInventory({
        functions: [{ slug: "active", version: 7, updated_at: "2026-09-21T00:00:00Z", id: "hidden" }],
      }),
    ).toEqual([{ name: "active", version: "7", updatedAt: "2026-09-21T00:00:00Z" }]);
  });

  it("ignores tests and line-ending differences when hashing downloaded source", () => {
    const root = mkdtempSync(join(tmpdir(), "edge-audit-"));
    const left = functionDir(join(root, "left"), "fn", "export const value = 1;\r\n");
    const right = functionDir(join(root, "right"), "fn", "export const value = 1;\n");
    writeFileSync(join(left, "index_test.ts"), "throw new Error('not deployed')");

    expect(hashFunctionSource(left)).toBe(hashFunctionSource(right));
  });

  it("fails closed when required or sensitive deployed source is unverified", () => {
    const root = mkdtempSync(join(tmpdir(), "edge-audit-"));
    const repo = join(root, "repo");
    const downloaded = join(root, "downloaded");
    functionDir(repo, "_shared", "export const shared = true;\n");
    functionDir(downloaded, "_shared", "export const shared = true;\n");
    for (const name of ["active", "retired", "migration", "global"]) {
      functionDir(repo, name, `export const name = '${name}';\n`);
    }
    functionDir(downloaded, "active", "export const name = 'active';\n");
    functionDir(downloaded, "retired", "export const unsafe = true;\n");

    const result = auditFunctions({
      repoFunctionsDir: repo,
      downloadedFunctionsDir: downloaded,
      inventory: normalizeInventory([
        { name: "active", version: 2 },
        { name: "retired", version: 1 },
      ]),
      policy,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "retired: sensitive deployed endpoint does not match the safe repository version",
    ]);
  });

  it("fails when shared deployed code is absent or different", () => {
    const root = mkdtempSync(join(tmpdir(), "edge-audit-"));
    const repo = join(root, "repo");
    const downloaded = join(root, "downloaded");
    functionDir(repo, "active", "export const active = true;\n");
    functionDir(repo, "_shared", "export const shared = 'current';\n");
    functionDir(downloaded, "active", "export const active = true;\n");
    functionDir(downloaded, "_shared", "export const shared = 'old';\n");

    const result = auditFunctions({
      repoFunctionsDir: repo,
      downloadedFunctionsDir: downloaded,
      inventory: [{ name: "active", version: "1", updatedAt: null }],
      policy,
    });

    expect(result.sharedSourceStatus).toBe("mismatch");
    expect(result.failures).toContain(
      "_shared: deployed shared source is not proven equal to the repository",
    );
  });

  it("fails when a required function is absent or source was not downloaded", () => {
    const root = mkdtempSync(join(tmpdir(), "edge-audit-"));
    const repo = join(root, "repo");
    functionDir(repo, "active", "export const active = true;\n");

    const missing = auditFunctions({ repoFunctionsDir: repo, inventory: [], policy });
    expect(missing.failures).toContain("active: required function is not deployed");

    const unverified = auditFunctions({
      repoFunctionsDir: repo,
      inventory: [{ name: "active", version: "1", updatedAt: null }],
      policy,
    });
    expect(unverified.failures).toContain(
      "active: deployed source is not proven equal to the repository",
    );
  });
});


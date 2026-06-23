#!/usr/bin/env node
/**
 * Test mocks fix-up: ensure every `vi.mock("@/lib/ui/appFeedback", ...)` exposes
 * notifySuccess/notifyInfo/notifyWarning/notifyValidation/notifyAsync as no-op
 * vi.fn(). Tests that previously mocked only `notifyError` would now break when
 * the hook under test calls the new helpers.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "../src");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const NEEDED = ["notifySuccess", "notifyInfo", "notifyWarning", "notifyValidation", "notifyAsync"];

let changed = 0;

for (const file of walk(SRC)) {
  if (!/(__tests__|\.test\.|\.spec\.)/.test(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes('vi.mock("@/lib/ui/appFeedback"')) continue;

  // Match the factory function body inside the mock: vi.mock("@/lib/ui/appFeedback", () => ({ ... }))
  // We add missing helpers as `vi.fn()` entries inside the returned object literal.
  const re = /vi\.mock\(\s*["']@\/lib\/ui\/appFeedback["']\s*,\s*\(\s*\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*\)/m;
  const m = src.match(re);
  if (!m) continue;

  const body = m[1];
  const missing = NEEDED.filter((n) => !new RegExp(`\\b${n}\\b`).test(body));
  if (missing.length === 0) continue;

  const additions = missing.map((n) => `  ${n}: vi.fn(),`).join("\n");
  const trimmed = body.replace(/\s+$/, "");
  const sep = trimmed.endsWith(",") || trimmed === "" ? "" : ",";
  const newBody = `${trimmed}${sep}\n${additions}\n`;
  const newMock = `vi.mock("@/lib/ui/appFeedback", () => ({${newBody}}))`;
  src = src.replace(re, newMock);

  fs.writeFileSync(file, src);
  changed++;
  console.log(`  ${path.relative(process.cwd(), file)}: added ${missing.join(", ")}`);
}

console.log(`\n${changed} test file(s) updated.`);

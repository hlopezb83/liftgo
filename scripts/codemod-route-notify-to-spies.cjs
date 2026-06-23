#!/usr/bin/env node
/**
 * Route notifySuccess/notifyInfo/notifyWarning in test mocks through the
 * existing `toastSuccess`/`toastInfo`/`toastWarning` hoisted spies so the
 * existing assertions (which were written against `toast.*` from sonner) keep
 * passing after the codemod that migrated hooks from `toast.*` to `notify*`.
 */
const fs = require("fs");
const path = require("path");
const SRC = path.resolve(__dirname, "../src");

const PAIRS = [
  ["notifySuccess", "toastSuccess"],
  ["notifyInfo", "toastInfo"],
  ["notifyWarning", "toastWarning"],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(SRC)) {
  if (!/(__tests__|\.test\.|\.spec\.)/.test(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes('vi.mock("@/lib/ui/appFeedback"')) continue;
  const before = src;
  for (const [helper, spy] of PAIRS) {
    if (!new RegExp(`\\b${spy}\\b`).test(src)) continue;
    src = src.replace(
      new RegExp(`(\\b${helper}\\s*:\\s*)vi\\.fn\\(\\)`, "g"),
      `$1${spy}`,
    );
  }
  if (src !== before) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(`  ${path.relative(process.cwd(), file)}`);
  }
}
console.log(`\n${changed} file(s) re-wired.`);

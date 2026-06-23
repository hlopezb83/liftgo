#!/usr/bin/env node
/**
 * Codemod: migra `toast.success/info/warning(...)` → `notifySuccess/notifyInfo/notifyWarning(...)`
 * y ajusta imports. Excluye tests (mantienen `vi.mock("sonner", ...)` intacto).
 *
 * Idempotente: si ya está migrado no hace nada.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "../src");
const EXCLUDE_FILES = new Set([
  path.resolve(SRC, "lib/ui/appFeedback.ts"),
  path.resolve(SRC, "components/ui/sonner.tsx"),
]);

const MAP = {
  "toast.success": "notifySuccess",
  "toast.info": "notifyInfo",
  "toast.warning": "notifyWarning",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isTestFile(file) {
  return /\.(test|spec)\.(ts|tsx)$/.test(file) || file.includes("__tests__");
}

let changed = 0;
let totalRepl = 0;

for (const file of walk(SRC)) {
  if (EXCLUDE_FILES.has(file)) continue;
  if (isTestFile(file)) continue;

  let src = fs.readFileSync(file, "utf8");
  const original = src;
  const needed = new Set();

  for (const [from, to] of Object.entries(MAP)) {
    // Replace only when followed by `(` to avoid grabbing comments/strings.
    const re = new RegExp(`\\btoast\\.${from.split(".")[1]}\\(`, "g");
    if (re.test(src)) {
      src = src.replace(re, `${to}(`);
      needed.add(to);
    }
  }

  if (needed.size === 0) continue;

  // Adjust imports
  // 1) If file imports `appFeedback`, merge the new names in.
  const appFeedbackImportRe = /import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/ui\/appFeedback["'];?/;
  const m = src.match(appFeedbackImportRe);
  if (m) {
    const existing = new Set(m[1].split(",").map((s) => s.trim()).filter(Boolean));
    for (const n of needed) existing.add(n);
    const merged = Array.from(existing).sort().join(", ");
    src = src.replace(appFeedbackImportRe, `import { ${merged} } from "@/lib/ui/appFeedback";`);
  } else {
    // Insert a new import. Place it after the last existing import line.
    const importLines = [...src.matchAll(/^import .*;$/gm)];
    const insertion = `import { ${Array.from(needed).sort().join(", ")} } from "@/lib/ui/appFeedback";`;
    if (importLines.length > 0) {
      const last = importLines[importLines.length - 1];
      const idx = last.index + last[0].length;
      src = src.slice(0, idx) + "\n" + insertion + src.slice(idx);
    } else {
      src = insertion + "\n" + src;
    }
  }

  // Clean up sonner import if `toast` is no longer used in file
  if (!/\btoast\.\w+\(/.test(src) && !/\btoast\(/.test(src)) {
    // Case A: `import { toast } from "sonner";` (only toast) → drop line
    src = src.replace(/^import\s*\{\s*toast\s*\}\s*from\s*["']sonner["'];?\s*$/gm, "");
    // Case B: `import { toast, X, Y } from "sonner";` → remove `toast` from the list
    src = src.replace(/import\s*\{([^}]+)\}\s*from\s*["']sonner["'];?/g, (full, inner) => {
      const items = inner.split(",").map((s) => s.trim()).filter((s) => s && s !== "toast");
      if (items.length === 0) return "";
      return `import { ${items.join(", ")} } from "sonner";`;
    });
    // Tidy potential double blank lines left by removals
    src = src.replace(/\n{3,}/g, "\n\n");
  }

  if (src !== original) {
    const diff = (original.match(/\btoast\.(success|info|warning)\(/g) || []).length;
    totalRepl += diff;
    fs.writeFileSync(file, src);
    changed++;
    console.log(`  ${path.relative(process.cwd(), file)}: ${diff} replacement(s)`);
  }
}

console.log(`\n${changed} file(s) modified, ${totalRepl} call(s) migrated.`);

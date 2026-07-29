import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * R23-1: al migrar columnas a `meta: { kind: "money" }`, 10 celdas quedaron
 * como arrow con cuerpo de bloque sin `return` (`cell: ({ row }) => {fmt(x)}`),
 * por lo que renderizaban vacías — incluido el portal del cliente.
 *
 * Este guard falla si el patrón reaparece en cualquier archivo de `src/`.
 */
const BAD_PATTERN = /=>\s*\{\s*format\w*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("celdas de dinero sin return (R23-1)", () => {
  it("no existe `=> {format...(` en ningún .tsx de src/", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BAD_PATTERN.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

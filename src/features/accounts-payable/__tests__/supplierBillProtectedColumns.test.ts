import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LIFTGO-A: la base de datos no deja que el navegador escriba directo en los
 * campos de aprobación, descuento ni empresa de una factura de proveedor. Esos
 * cambios van por funciones del servidor. Un `.update()` directo con un objeto
 * variable (como el antiguo `update(patch)`) podía incluirlos y fallaba con 42501.
 */
const PROTECTED = ["id", "created_at", "organization_id", "discount", "approval_status", "approved_by",
  "approved_at", "approval_notes", "rejected_by", "rejected_at"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.|types\.ts$/.test(name) ? [path] : [];
  });
}

function directSupplierBillUpdates(): { file: string; payload: string }[] {
  const found: { file: string; payload: string }[] = [];
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\(["']supplier_bills["']\)([\s\S]{0,400}?)\.update\(([^)]*)\)/g)) {
      // Mismo encadenamiento: sin `;` entre la tabla y `.update()`.
      if (!match[1].includes(";")) found.push({ file, payload: match[2].trim() });
    }
  }
  return found;
}

describe("facturas de proveedor: escrituras directas", () => {
  it("cada actualización directa usa campos explícitos y ninguno es protegido", () => {
    const updates = directSupplierBillUpdates();
    expect(updates.length).toBeGreaterThan(0);
    for (const { file, payload } of updates) {
      expect(payload.startsWith("{"), `${file} envía un objeto variable: ${payload}`).toBe(true);
      const keys = [...payload.matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]);
      expect(keys.filter((key) => PROTECTED.includes(key)), file).toEqual([]);
    }
  });

  it("la edición completa pasa por la función del servidor y no por la tabla", () => {
    const text = readFileSync("src/features/accounts-payable/hooks/useSupplierBillMutations.ts", "utf8");
    const edit = text.slice(text.indexOf("export function useUpdateSupplierBill"), text.indexOf("async function assertNoCompletedPayments"));
    expect(edit).toContain('callRpc<string>("update_supplier_bill_details"');
    expect(edit).not.toContain(".update(");
  });
});

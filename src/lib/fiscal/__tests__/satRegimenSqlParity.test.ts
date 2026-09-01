import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

/**
 * R9-05: existen tres representaciones del catálogo SAT (matriz de
 * aplicabilidad del frontend, `REGIMEN_FISCAL_CODES` del Edge y la lista
 * dentro de `public.normalize_regimen_fiscal`). Frontend<->Edge ya tienen
 * paridad probada; aquí se cierra el tercer lado SIN crear una cuarta lista:
 * los códigos esperados se derivan del catálogo del frontend y los reales se
 * extraen del código fuente de la migración que define la función SQL.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");
const DEF_MARKER = "CREATE OR REPLACE FUNCTION public.normalize_regimen_fiscal";

function latestFunctionSource(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const withDef = files.filter((f) =>
    readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").includes(DEF_MARKER),
  );
  expect(withDef.length).toBeGreaterThan(0);
  const src = readFileSync(path.join(MIGRATIONS_DIR, withDef[withDef.length - 1]), "utf8");
  const start = src.indexOf(DEF_MARKER);
  const end = src.indexOf("$$;", start);
  return src.slice(start, end);
}

describe("R9-05 · paridad catálogo SAT frontend <-> normalize_regimen_fiscal (SQL)", () => {
  it("la función SQL acepta exactamente los códigos del catálogo del frontend", () => {
    const body = latestFunctionSource();
    const sqlCodes = [...body.matchAll(/'(\d{3})'/g)].map((m) => m[1]);
    const esperados = REGIMEN_FISCAL.map((r) => r.code);
    expect([...new Set(sqlCodes)].sort()).toEqual([...new Set(esperados)].sort());
  });
});

// El prebuild genera `public/version.json` desde el changelog. Si una entrada
// inválida pasa desapercibida, la app publica una versión equivocada (o
// "unknown"). Estas pruebas congelan la validación que rompe el build.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — módulo .mjs de scripts, sin tipos.
import { validateEntries } from "../../scripts/changelog-entry.mjs";

const ok = { version: "1.2.3", date: "2026-01-01", title: "Algo" };

describe("validateEntries", () => {
  it("acepta el changelog real del repositorio", () => {
    const entries = JSON.parse(readFileSync("public/changelog.json", "utf8"));
    expect(validateEntries(entries)).toEqual([]);
  });

  it("rechaza un array vacío", () => {
    expect(validateEntries([])).toHaveLength(1);
  });

  it("rechaza versiones que no son semver", () => {
    expect(validateEntries([{ ...ok, version: "v1.2" }]).join()).toMatch(/semver/);
  });

  it("rechaza versiones duplicadas", () => {
    expect(validateEntries([ok, { ...ok }]).join()).toMatch(/duplicada/);
  });

  it("rechaza fechas mal formadas", () => {
    expect(validateEntries([{ ...ok, date: "01/01/2026" }]).join()).toMatch(/YYYY-MM-DD/);
  });

  it("rechaza entradas sin título", () => {
    expect(validateEntries([{ ...ok, title: "  " }]).join()).toMatch(/title/);
  });

  it("rechaza orden ascendente", () => {
    const errs = validateEntries([
      { ...ok, version: "1.0.0" },
      { ...ok, version: "2.0.0" },
    ]);
    expect(errs.join()).toMatch(/Orden incorrecto/);
  });
});

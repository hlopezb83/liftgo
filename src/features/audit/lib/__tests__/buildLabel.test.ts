import { describe, it, expect } from "vitest";
import { buildLabel, type LabelProjectionRow } from "../queryKeys";

const empty: LabelProjectionRow = {
  table_name: "quotes",
  new_name: null, new_booking: null, new_contract: null,
  new_invoice: null, new_quote: null, new_desc: null,
  old_name: null, old_booking: null, old_contract: null,
  old_invoice: null, old_quote: null, old_desc: null,
  new_full: null, old_full: null,
  new_email: null, old_email: null,
  new_role: null, old_role: null,
};

describe("buildLabel — etiquetas de bitácora (R9-P2-05)", () => {
  it("etiqueta user_roles con el nombre legible del rol, no con el hex", () => {
    const label = buildLabel({ ...empty, table_name: "user_roles", new_role: "admin" }, "a3f9b2c1-0000");
    expect(label).toBe("Rol: Admin");
    expect(label).not.toContain("a3f9b2c1");
  });

  it("usa old_role cuando el rol fue eliminado", () => {
    expect(
      buildLabel({ ...empty, table_name: "user_roles", old_role: "mecanico" }, "ffffffff-0000"),
    ).toMatch(/^Rol: /);
  });

  it("deja pasar un rol desconocido tal cual en vez de romper", () => {
    expect(
      buildLabel({ ...empty, table_name: "user_roles", new_role: "rol_futuro" }, "aaaaaaaa"),
    ).toBe("Rol: rol_futuro");
  });

  it("etiqueta profiles con el nombre completo", () => {
    expect(
      buildLabel({ ...empty, table_name: "profiles", new_full: "Ana Torres" }, "bbbbbbbb-1111"),
    ).toBe("Ana Torres");
  });

  it("etiqueta profiles con el correo cuando no hay nombre", () => {
    expect(
      buildLabel({ ...empty, table_name: "profiles", old_email: "ana@liftgo.mx" }, "bbbbbbbb-1111"),
    ).toBe("ana@liftgo.mx");
  });

  it("mantiene la etiqueta habitual del resto de tablas", () => {
    expect(buildLabel({ ...empty, table_name: "quotes", new_quote: "COT-0042" }, "cccccccc")).toBe("COT-0042");
  });

  it("cae al identificador corto sólo cuando no hay ninguna fuente", () => {
    expect(buildLabel({ ...empty, table_name: "user_roles" }, "dddddddd-2222")).toBe("dddddddd");
  });
});

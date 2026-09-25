import { describe, it, expect } from "vitest";
import { preserveUntouched } from "../../../lib/preserveUntouched";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

const base = {
  name: "HYVA", email: "", phone: "", address: "", notes: "", website: "", contact_person: "",
  rfc: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "", representante_legal: "", tax_rate: "",
} as CustomerFormData;
const initial = { ...base, email: "a@b.mx", phone: "8112345678" };

describe("preserveUntouched", () => {
  it("conserva correo/teléfono si llegaron vacíos sin que el usuario los tocara", () => {
    const r = preserveUntouched({ ...base, notes: "x" }, initial, true, { notes: true });
    expect(r.email).toBe("a@b.mx");
    expect(r.phone).toBe("8112345678");
  });
  it("permite borrar a propósito", () => {
    expect(preserveUntouched(base, initial, true, { email: true }).email).toBe("");
  });
  it("no aplica en alta", () => {
    expect(preserveUntouched(base, initial, false, {}).email).toBe("");
  });
});

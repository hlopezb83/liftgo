import { describe, it, expect } from "vitest";
import { makeSchema } from "../ReportTransferDialog";

const balance = 1234.5;
const schema = makeSchema(balance);

const valid = {
  transferDate: new Date("2026-02-01T12:00:00Z"),
  amount: 100,
  senderBank: "",
  senderLast4: "",
  trackingKey: "",
  proofFile: null,
};

describe("ReportTransferDialog — validación de monto (R9-P2-04)", () => {
  it("acepta un monto menor al saldo", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("acepta exactamente el saldo pendiente", () => {
    expect(schema.safeParse({ ...valid, amount: balance }).success).toBe(true);
  });

  it("rechaza un sobrepago e indica el saldo exacto en el mensaje", () => {
    const res = schema.safeParse({ ...valid, amount: balance + 1 });
    expect(res.success).toBe(false);
    if (res.success) return;
    const msg = res.error.issues.map((i) => i.message).join(" ");
    expect(msg).toContain("1,234.5");
    expect(msg).toMatch(/saldo pendiente/i);
  });

  it("rechaza montos en cero o negativos", () => {
    expect(schema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, amount: -50 }).success).toBe(false);
  });

  it("valida que los últimos 4 dígitos sean 4 números", () => {
    expect(schema.safeParse({ ...valid, senderLast4: "12" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, senderLast4: "1234" }).success).toBe(true);
  });
});

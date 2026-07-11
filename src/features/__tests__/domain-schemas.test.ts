/**
 * Suite table-driven que ejercita los schemas de dominio principales.
 *
 * Objetivo: cubrir la brecha entre `schemas.common.test.ts` (helpers puros)
 * y las suites por feature. Cada entrada define fixtures `valid` e
 * `invalid` con el error clave esperado, sirviendo también como
 * documentación viva del contrato de cada formulario.
 */
import { describe, it, expect } from "vitest";
import type { z } from "zod";

import { customerFormSchema } from "@/features/customers/lib/customerFormSchema";
import { supplierFormSchema } from "@/features/suppliers/lib/supplierFormSchema";
import { partFormSchema } from "@/features/inventory/lib/partFormSchema";
import { optionalEmail, positiveAmountCoerced, nonNegativeAmountCoerced } from "@/lib/schemas";

interface Case {
  name: string;
  schema: z.ZodTypeAny;
  valid: unknown;
  invalid: { payload: unknown; errorMatches: RegExp | string };
}

const cases: Case[] = [
  {
    name: "customerFormSchema — nombre requerido",
    schema: customerFormSchema,
    valid: { name: "Cliente Demo", email: "demo@x.com", rfc: "XAXX010101000" },
    invalid: { payload: { name: "" }, errorMatches: /nombre/i },
  },
  {
    name: "customerFormSchema — RFC inválido",
    schema: customerFormSchema,
    valid: { name: "Cliente", rfc: "" },
    invalid: { payload: { name: "X", rfc: "MAL" }, errorMatches: /RFC inválido/ },
  },
  {
    name: "supplierFormSchema — email opcional pero validado",
    schema: supplierFormSchema,
    valid: { name: "Proveedor", email: "ok@x.com" },
    invalid: {
      payload: { name: "Proveedor", email: "no-es-email" },
      errorMatches: /Correo electrónico/,
    },
  },
  {
    name: "supplierFormSchema — payment terms fuera de rango",
    schema: supplierFormSchema,
    valid: { name: "Proveedor", default_payment_terms_days: "30" },
    invalid: {
      payload: { name: "Proveedor", default_payment_terms_days: "500" },
      errorMatches: /entre 0 y 365/,
    },
  },
  {
    name: "partFormSchema — stock negativo",
    schema: partFormSchema,
    valid: {
      name: "Filtro aire",
      category: "filtros",
      stock_quantity: 10,
      min_stock_level: 2,
      unit_cost: 150.5,
    },
    invalid: {
      payload: {
        name: "X",
        category: "filtros",
        stock_quantity: -1,
        min_stock_level: 0,
        unit_cost: 0,
      },
      errorMatches: /negativo/i,
    },
  },
  {
    name: "partFormSchema — coerción de strings numéricos",
    schema: partFormSchema,
    valid: {
      name: "X",
      category: "cat",
      stock_quantity: "5",
      min_stock_level: "1",
      unit_cost: "99.9",
    },
    invalid: {
      payload: {
        name: "X",
        category: "cat",
        stock_quantity: "abc",
        min_stock_level: 0,
        unit_cost: 0,
      },
      errorMatches: /Cantidad inválida/,
    },
  },
];

describe("schemas de dominio — fixtures válidos/inválidos", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(c.schema.safeParse(c.valid).success).toBe(true);
      const bad = c.schema.safeParse(c.invalid.payload);
      expect(bad.success).toBe(false);
      if (!bad.success) {
        const messages = bad.error.issues.map((i) => i.message).join(" | ");
        if (c.invalid.errorMatches instanceof RegExp) {
          expect(messages).toMatch(c.invalid.errorMatches);
        } else {
          expect(messages).toContain(c.invalid.errorMatches);
        }
      }
    });
  }
});

describe("helpers de @/lib/schemas — nuevas fábricas de coerción", () => {
  it("positiveAmountCoerced acepta strings numéricos", () => {
    const s = positiveAmountCoerced();
    const r = s.safeParse("1500.50");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(1500.5);
  });

  it("positiveAmountCoerced rechaza 0 y strings no numéricos", () => {
    const s = positiveAmountCoerced();
    expect(s.safeParse("0").success).toBe(false);
    expect(s.safeParse("abc").success).toBe(false);
  });

  it("nonNegativeAmountCoerced acepta 0 y rechaza negativos", () => {
    const s = nonNegativeAmountCoerced();
    expect(s.safeParse("0").success).toBe(true);
    expect(s.safeParse("-1").success).toBe(false);
  });

  it("optionalEmail sigue aceptando '' y email válido (Zod 4 z.email)", () => {
    const s = optionalEmail();
    expect(s.safeParse("").success).toBe(true);
    expect(s.safeParse("hola@liftgo.mx").success).toBe(true);
    expect(s.safeParse("no-es-email").success).toBe(false);
  });
});

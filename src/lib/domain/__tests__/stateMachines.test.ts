/**
 * E2: matriz exhaustiva de transiciones (válidas e inválidas) para invoices,
 * deliveries y contracts, según los triggers de las migraciones del
 * 10-ago-2026 (m13–m18).
 *
 * Cada entidad se prueba sobre el producto cartesiano estado_origen ×
 * estado_destino, de modo que agregar un estado nuevo sin actualizar la
 * whitelist rompe estos tests.
 */

import { describe, expect, it } from "vitest";
import {
  CONTRACT_FROZEN_FIELDS,
  CONTRACT_STATUSES,
  CONTRACT_TRANSITIONS,
  DELIVERY_STATUSES,
  DELIVERY_TRANSITIONS,
  INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  canEditContractField,
  canTransitionContract,
  canTransitionDelivery,
  canTransitionInvoice,
  isContractFrozen,
  isValidInitialDeliveryStatus,
  isValidInitialInvoiceStatus,
  type ContractStatus,
  type DeliveryStatus,
  type InvoiceStatus,
} from "../stateMachines";

describe("invoices · máquina de estados", () => {
  const pairs = INVOICE_STATUSES.flatMap((from) =>
    INVOICE_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)("%s -> %s coincide con la whitelist del trigger", (from, to) => {
    const expected = from === to || INVOICE_TRANSITIONS[from].includes(to);
    expect(canTransitionInvoice(from, to)).toBe(expected);
  });

  it("bloquea los estados terminales", () => {
    const terminals: InvoiceStatus[] = ["paid", "cancelled"];
    for (const from of terminals) {
      for (const to of INVOICE_STATUSES.filter((s) => s !== from)) {
        expect(canTransitionInvoice(from, to)).toBe(false);
      }
    }
  });

  it("nunca permite volver a draft", () => {
    for (const from of INVOICE_STATUSES.filter((s) => s !== "draft")) {
      expect(canTransitionInvoice(from, "draft")).toBe(false);
    }
  });

  it("paid -> cancelled solo con el flujo fiscal (SAT / service_role)", () => {
    expect(canTransitionInvoice("paid", "cancelled")).toBe(false);
    expect(canTransitionInvoice("paid", "cancelled", { satFlow: true })).toBe(true);
    // El bypass fiscal no abre otras puertas.
    expect(canTransitionInvoice("paid", "sent", { satFlow: true })).toBe(false);
    expect(canTransitionInvoice("cancelled", "paid", { satFlow: true })).toBe(false);
  });

  it("payment_sync permite moverse entre sent/partial/overdue/paid", () => {
    const sync = { paymentSync: true } as const;
    expect(canTransitionInvoice("sent", "partial", sync)).toBe(true);
    expect(canTransitionInvoice("paid", "partial", sync)).toBe(true);
    expect(canTransitionInvoice("partial", "paid", sync)).toBe(true);
    // draft y cancelled quedan fuera del bypass.
    expect(canTransitionInvoice("draft", "paid", sync)).toBe(false);
    expect(canTransitionInvoice("cancelled", "paid", sync)).toBe(false);
    // Sin el flag, partial -> paid sigue prohibido.
    expect(canTransitionInvoice("partial", "paid")).toBe(false);
  });

  it("solo draft y sent son estados iniciales válidos", () => {
    expect(INVOICE_STATUSES.filter(isValidInitialInvoiceStatus)).toEqual(["draft", "sent"]);
  });
});

describe("deliveries · máquina de estados", () => {
  const pairs = DELIVERY_STATUSES.flatMap((from) =>
    DELIVERY_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)("%s -> %s coincide con la whitelist del trigger", (from, to) => {
    const expected = from === to || DELIVERY_TRANSITIONS[from].includes(to);
    expect(canTransitionDelivery(from, to)).toBe(expected);
  });

  it("completed y cancelled son terminales", () => {
    const terminals: DeliveryStatus[] = ["completed", "cancelled"];
    for (const from of terminals) {
      for (const to of DELIVERY_STATUSES.filter((s) => s !== from)) {
        expect(canTransitionDelivery(from, to)).toBe(false);
      }
    }
  });

  it("scheduled no puede regresar a pending", () => {
    expect(canTransitionDelivery("scheduled", "pending")).toBe(false);
    expect(canTransitionDelivery("pending", "scheduled")).toBe(true);
  });

  it("acepta pending, scheduled y completed como estado inicial", () => {
    expect(DELIVERY_STATUSES.filter(isValidInitialDeliveryStatus)).toEqual([
      "pending",
      "scheduled",
      "completed",
    ]);
    expect(isValidInitialDeliveryStatus("cancelled")).toBe(false);
  });
});

describe("contracts · candado de firmado/activo", () => {
  const pairs = CONTRACT_STATUSES.flatMap((from) =>
    CONTRACT_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)("%s -> %s (admin) coincide con la whitelist", (from, to) => {
    const expected = from === to || CONTRACT_TRANSITIONS[from].includes(to);
    expect(canTransitionContract(from, to, { isAdmin: true })).toBe(expected);
  });

  it("un no-admin no mueve contratos firmados, activos ni cancelados", () => {
    const locked: ContractStatus[] = ["signed", "active", "cancelled"];
    for (const from of locked) {
      for (const to of CONTRACT_STATUSES.filter((s) => s !== from)) {
        expect(canTransitionContract(from, to)).toBe(false);
      }
    }
  });

  it("un no-admin sí mueve borradores y enviados", () => {
    expect(canTransitionContract("draft", "sent")).toBe(true);
    expect(canTransitionContract("sent", "signed")).toBe(true);
  });

  it("signed/active solo van a completed o cancelled, nunca hacia atrás", () => {
    for (const from of ["signed", "active"] as const) {
      expect(canTransitionContract(from, "completed", { isAdmin: true })).toBe(true);
      expect(canTransitionContract(from, "cancelled", { isAdmin: true })).toBe(true);
      for (const to of ["draft", "sent"] as const) {
        expect(canTransitionContract(from, to, { isAdmin: true })).toBe(false);
      }
    }
    expect(canTransitionContract("active", "signed", { isAdmin: true })).toBe(false);
    expect(canTransitionContract("signed", "active", { isAdmin: true })).toBe(false);
  });

  it("cancelled es terminal incluso para admin", () => {
    for (const to of CONTRACT_STATUSES.filter((s) => s !== "cancelled")) {
      expect(canTransitionContract("cancelled", to, { isAdmin: true })).toBe(false);
    }
  });

  // Sprint 4 (Fix 4.1)
  it("completed es terminal incluso para admin", () => {
    for (const to of CONTRACT_STATUSES.filter((s) => s !== "completed")) {
      expect(canTransitionContract("completed", to, { isAdmin: true })).toBe(false);
    }
    expect(canTransitionContract("completed", "completed", { isAdmin: true })).toBe(true);
  });

  it("congela los campos económicos de un contrato firmado/activo/completado/cancelado", () => {
    for (const status of ["signed", "active", "completed", "cancelled"] as const) {
      expect(isContractFrozen(status)).toBe(true);
      for (const field of CONTRACT_FROZEN_FIELDS) {
        expect(canEditContractField(status, field)).toBe(false);
      }
      // Campos no listados siguen siendo editables (p. ej. notas internas).
      expect(canEditContractField(status, "notes")).toBe(true);
    }
    for (const status of ["draft", "sent"] as const) {
      expect(isContractFrozen(status)).toBe(false);
      expect(canEditContractField(status, "daily_rate")).toBe(true);
    }
  });
});


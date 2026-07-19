import { describe, expect, it } from "vitest";

/**
 * BL-43/44/45 — Modelo TypeScript de la nueva regla de saldo servida por:
 *  - `v_invoices_with_balance` (vista)
 *  - `get_portal_invoices` (RPC del portal)
 *  - `get_customer_summary` (`outstanding_revenue`)
 *
 * Este test protege el invariante: balance = mayor(total − pagado − NCs vigentes, 0),
 * donde NC vigente = `cancellation_status <> 'accepted' AND status <> 'cancelled'`.
 * Además cubre la exclusión de facturas `draft`/`cancelled` en el portal y el
 * cálculo de `outstanding_revenue` restringido a `sent | partial | overdue`.
 */

type Invoice = {
  id: string;
  customer_id: string;
  status: "draft" | "sent" | "partial" | "overdue" | "paid" | "cancelled";
  total: number;
};
type Payment = { invoice_id: string; amount: number };
type CreditNote = {
  invoice_id: string;
  total: number;
  status: "draft" | "stamped" | "cancelled";
  cancellation_status: "none" | "requested" | "accepted";
};

const nonZero = (n: number) => Math.max(n, 0);

function creditedByInvoice(cns: CreditNote[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const cn of cns) {
    // Regla NC vigente (idéntica a la migración).
    if (cn.cancellation_status === "accepted" || cn.status === "cancelled") continue;
    m.set(cn.invoice_id, (m.get(cn.invoice_id) ?? 0) + cn.total);
  }
  return m;
}

function paidByInvoice(ps: Payment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of ps) m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + p.amount);
  return m;
}

function balanceOf(inv: Invoice, ps: Payment[], cns: CreditNote[]): number {
  const paid = paidByInvoice(ps).get(inv.id) ?? 0;
  const credited = creditedByInvoice(cns).get(inv.id) ?? 0;
  return nonZero(inv.total - paid - credited);
}

function portalInvoices(customerId: string, invs: Invoice[], ps: Payment[], cns: CreditNote[]) {
  return invs
    .filter((i) => i.customer_id === customerId)
    .filter((i) => i.status !== "draft" && i.status !== "cancelled")
    .map((i) => ({
      ...i,
      paid_amount: paidByInvoice(ps).get(i.id) ?? 0,
      credited_amount: creditedByInvoice(cns).get(i.id) ?? 0,
      balance: balanceOf(i, ps, cns),
    }));
}

function outstandingRevenue(customerId: string, invs: Invoice[], ps: Payment[], cns: CreditNote[]) {
  return invs
    .filter((i) => i.customer_id === customerId)
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((s, i) => s + balanceOf(i, ps, cns), 0);
}

describe("BL-43/44/45 — saldo con NCs y estatus (paridad vista/portal/resumen)", () => {
  const CID = "cust-1";

  it("NC total vigente sobre factura → balance $0 en vista, portal y resumen", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "sent", total: 100_000 },
    ];
    const cns: CreditNote[] = [
      { invoice_id: "f1", total: 100_000, status: "stamped", cancellation_status: "none" },
    ];
    expect(balanceOf(invs[0], [], cns)).toBe(0);
    expect(portalInvoices(CID, invs, [], cns)[0].balance).toBe(0);
    expect(outstandingRevenue(CID, invs, [], cns)).toBe(0);
  });

  it("NC cancelada (SAT accepted) no cuenta — la deuda vuelve", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "sent", total: 50_000 },
    ];
    const cns: CreditNote[] = [
      { invoice_id: "f1", total: 50_000, status: "stamped", cancellation_status: "accepted" },
    ];
    expect(balanceOf(invs[0], [], cns)).toBe(50_000);
    expect(outstandingRevenue(CID, invs, [], cns)).toBe(50_000);
  });

  it("factura cancelada no aparece en el portal ni suma en outstanding", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "cancelled", total: 30_000 },
      { id: "f2", customer_id: CID, status: "sent", total: 20_000 },
    ];
    const portal = portalInvoices(CID, invs, [], []);
    expect(portal.map((p) => p.id)).toEqual(["f2"]);
    expect(outstandingRevenue(CID, invs, [], [])).toBe(20_000);
  });

  it("factura draft se excluye del portal", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "draft", total: 10_000 },
      { id: "f2", customer_id: CID, status: "sent", total: 20_000 },
    ];
    expect(portalInvoices(CID, invs, [], []).map((p) => p.id)).toEqual(["f2"]);
  });

  it("pago parcial + NC parcial → balance = total − pagado − NC", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "partial", total: 100_000 },
    ];
    const pays: Payment[] = [{ invoice_id: "f1", amount: 40_000 }];
    const cns: CreditNote[] = [
      { invoice_id: "f1", total: 20_000, status: "stamped", cancellation_status: "none" },
    ];
    expect(balanceOf(invs[0], pays, cns)).toBe(40_000);
    expect(outstandingRevenue(CID, invs, pays, cns)).toBe(40_000);
  });

  it("nunca hay balance negativo (over-pago o over-NC lo aplasta a 0)", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "sent", total: 50_000 },
    ];
    const cns: CreditNote[] = [
      { invoice_id: "f1", total: 60_000, status: "stamped", cancellation_status: "none" },
    ];
    expect(balanceOf(invs[0], [], cns)).toBe(0);
  });

  it("outstanding_revenue ignora paid y cancelled aun con NC pendiente", () => {
    const invs: Invoice[] = [
      { id: "f1", customer_id: CID, status: "paid", total: 10_000 },
      { id: "f2", customer_id: CID, status: "cancelled", total: 5_000 },
      { id: "f3", customer_id: CID, status: "overdue", total: 8_000 },
    ];
    expect(outstandingRevenue(CID, invs, [], [])).toBe(8_000);
  });
});

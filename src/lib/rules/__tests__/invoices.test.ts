import { describe, it, expect } from "vitest";
import { computeInvoiceFlags } from "../invoices";
import type { Tables } from "@/integrations/supabase/types";

const inv = (partial: Partial<Tables<"invoices">> & Record<string, unknown>): Tables<"invoices"> =>
  ({
    id: "i1",
    status: "draft",
    cfdi_status: "pending",
    metodo_pago: "PUE",
    total: 100,
    ...partial,
  }) as unknown as Tables<"invoices">;

describe("rules/invoices computeInvoiceFlags", () => {
  it("draft pending: editable, deletable, stampable", () => {
    const f = computeInvoiceFlags(inv({}), "pending", { facturapi_mode: "test" });
    expect(f.isDraft).toBe(true);
    expect(f.canEdit).toBe(true);
    expect(f.canDelete).toBe(true);
    expect(f.canStamp).toBe(true);
    expect(f.canCancelCfdi).toBe(false);
    expect(f.visibility.showDraftPdf).toBe(true);
    expect(f.visibility.showCfdiPdf).toBe(false);
  });

  it("stamped: no edit/delete/stamp, allows cancel and CFDI docs", () => {
    const f = computeInvoiceFlags(inv({ status: "sent" }), "stamped", null);
    expect(f.canEdit).toBe(false);
    expect(f.canDelete).toBe(false);
    expect(f.canStamp).toBe(false);
    expect(f.canCancelCfdi).toBe(true);
    expect(f.visibility.showCfdiPdf).toBe(true);
    expect(f.visibility.showCfdiXml).toBe(true);
  });

  it("cancellation pending: no re-cancel and shows sync hint", () => {
    const f = computeInvoiceFlags(
      inv({ status: "sent", cancellation_status: "pending", cancellation_motive: "02" } as never),
      "stamped",
      null,
    );
    expect(f.isPendingCancel).toBe(true);
    expect(f.canCancelCfdi).toBe(false);
  });

  it("cancelled: sync hint until acuse arrives", () => {
    const f = computeInvoiceFlags(
      inv({ status: "cancelled", cancellation_status: "pending" } as never),
      "cancelled",
      null,
    );
    expect(f.isCancelled).toBe(true);
    expect(f.visibility.showAcuseSyncHint).toBe(true);
    expect(f.visibility.showAcuseButtons).toBe(false);
  });
});

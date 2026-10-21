import { useLayoutEffect, useRef, useState } from "react";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useHasModuleAccess } from "@/features/users";
import { exportToCsvGuarded } from "@/lib/exportCsv";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { notifyError } from "@/lib/ui/appFeedback";
import { fetchInvoicesForExport } from "./invoiceQueries";
import type { InvoiceListFilters } from "../../lib/invoiceListFilters";

/** A download belongs to one verified context, never to a later visit to it. */
export function useInvoiceCsvExport(filters: InvoiceListFilters) {
  const identity = useVerifiedIdentityScope();
  const organizationId = useVerifiedOrganizationId();
  const allowed = useHasModuleAccess("Facturas", "read");
  const key = JSON.stringify([identity, organizationId, allowed, filters]);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    return () => { epoch.current += 1; controller.current?.abort(); controller.current = null; };
  }, [key]);

  const download = async () => {
    if (!identity || !organizationId || !allowed || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    abort.signal.addEventListener("abort", () => {
      if (controller.current === abort) setBusy(false);
    }, { once: true });
    const generation = epoch.current;
    const current = () => !abort.signal.aborted && epoch.current === generation;
    setBusy(true);
    try {
      const rows = await fetchInvoicesForExport(filters, { organizationId, signal: abort.signal });
      if (!current()) return;
      await exportToCsvGuarded("facturas.csv", rows.map((inv) => ({
        "Factura #": inv.invoice_number, Cliente: inv.customer_name || "", Total: inv.total,
        Moneda: inv.moneda || "MXN", "Tipo de cambio": inv.tipo_cambio ?? "",
        Estado: inv.status, Emitida: inv.issued_at, Vencimiento: inv.due_date || "",
      })), current);
    } catch (error) {
      if (current()) notifyError({ title: "No se pudieron exportar las facturas", error });
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  };
  return { download, busy, allowed: Boolean(identity && organizationId && allowed) };
}

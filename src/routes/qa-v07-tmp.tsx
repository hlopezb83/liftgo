import { createFileRoute } from "@tanstack/react-router";
import { InvoiceFinancialOverview } from "@/features/invoices/components/invoice-detail/InvoiceFinancialOverview";
import { InvoiceDetailBadges } from "@/features/invoices/components/invoice-detail/InvoiceDetailBadges";
import { InvoiceDetailIdentifiers } from "@/features/invoices/components/invoice-detail/InvoiceDetailIdentifiers";
export const Route = createFileRoute("/qa-v07-tmp")({ component: () => (
  <div className="space-y-4 p-4">
    <div className="flex flex-wrap gap-2"><InvoiceDetailBadges invoiceStatus="partial" cfdiStatus="stamped" showSandboxChip cfdiXmlPending /></div>
    <div className="flex flex-wrap gap-2"><InvoiceDetailBadges invoiceStatus="sent" cfdiStatus="stamped" cancellationStatus="accepted" showSandboxChip={false} /></div>
    <InvoiceFinancialOverview total={123456789012.34} totalPaid={20000} balance={-50} creditedAmount={10000} currency="USD" />
    <InvoiceDetailIdentifiers cfdiUuid="eb3abf2f-d404-49fd-bb6f-d694a36d1056" serie="F" folio="958" />
  </div>) });

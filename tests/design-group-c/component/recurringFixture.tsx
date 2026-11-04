import { useState } from "react";
import { RecurringInvoicesPreviewDialog } from "../../../src/features/invoices/components/recurring/RecurringInvoicesPreviewDialog";
import type { RecurringPreviewLine, RecurringPreviewScope } from "../../../src/features/invoices/hooks/invoices/recurring/usePreviewRecurringInvoices";

const pending: RecurringPreviewLine[] = Array.from({ length: 18 }, (_, index) => ({
  bookingId: `qa-${index}`, bookingCode: `QA-${index}`, customerId: `customer-${index % 3}`,
  customerName: `Cliente ficticio ${index % 3}`, forkliftName: "Equipo industrial ficticio de nombre largo",
  periodStart: "2026-11-01", periodEnd: "2026-11-30", periodLabel: "Noviembre 2026",
  previewFingerprint: `fixture-${index}`, monthlyRate: 1000, billedAmount: 1000, eligible: true, isProrated: false,
}));

export function RecurringFixture() {
  const [open, setOpen] = useState(true);
  const [scope, setScope] = useState<RecurringPreviewScope>({ includeFuturePeriods: false });
  const [confirmation, setConfirmation] = useState("");
  const futureMonth = scope.futureThroughMonth ?? "2026-12";
  const [year, month] = futureMonth.split("-").map(Number);
  const futureEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const lines: RecurringPreviewLine[] = [
    ...pending,
    { ...pending[0], bookingId: "billed", customerId: "billed", customerName: "Cliente facturado oculto", eligible: false, reason: "already_invoiced" },
    { ...pending[0], bookingId: "ended", customerId: "ended", customerName: "Cliente terminado oculto", eligible: false, reason: "booking_ended" },
    { ...pending[0], bookingId: "review", bookingCode: "QA-REVIEW", eligible: false, reason: "legacy_period_review" },
    ...(scope.includeFuturePeriods ? [
      { ...pending[0], bookingId: "future", bookingCode: "QA-FUTURE", periodStart: `${futureMonth}-01`, periodEnd: futureEnd, periodLabel: "Período adelantado", isFuture: true },
      { ...pending[0], bookingCode: "QA-CONTIGUOUS", periodStart: `${futureMonth}-01`, periodEnd: futureEnd, periodLabel: "Período consecutivo adelantado", isFuture: true },
    ] : []),
  ];
  return <main className="p-4">
    <button onClick={() => { setScope({ includeFuturePeriods: false }); setOpen(true); }}>Abrir recurrentes</button>
    <output aria-label="Confirmación ficticia">{confirmation}</output>
    <RecurringInvoicesPreviewDialog open={open} onOpenChange={setOpen}
      data={{ period: "2026-11", lines, scope }} isLoading={false} isGenerating={false}
      onScopeChange={setScope}
      onConfirm={(selections, allowStaleRate, selectedScope) => {
        setConfirmation(JSON.stringify({ selections, allowStaleRate, ...selectedScope }));
        setOpen(false);
      }} />
  </main>;
}

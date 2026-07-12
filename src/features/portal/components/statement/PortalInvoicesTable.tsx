import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

export interface PortalPayment {
  id: string;
  invoice_id: string | null;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  amount: number | string;
}

export interface PortalInvoiceRow {
  inv: {
    id: string;
    invoice_number: string;
    issued_at: string;
    due_date: string | null;
    total: number | string;
    status: string;
  };
  payments: PortalPayment[];
  paid: number;
  balance: number;
}

interface Props {
  rows: PortalInvoiceRow[];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
}

function PaymentDetailTable({ payments }: { payments: PortalPayment[] }) {
  if (payments.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin pagos aplicados.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left">Fecha</th>
          <th className="text-left">Método</th>
          <th className="text-left">Referencia</th>
          <th className="text-right">Monto</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <td>{formatDateDisplay(p.payment_date)}</td>
            <td>{p.payment_method ?? "—"}</td>
            <td>{p.reference_number ?? "—"}</td>
            <td className="text-right font-mono">{formatCurrency(Number(p.amount))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceRow({ row, idx, isOpen, onToggle }: { row: PortalInvoiceRow; idx: number; isOpen: boolean; onToggle: () => void }) {
  const r = row;
  return (
    <>
      <tr className={idx % 2 ? "bg-muted/20" : ""}>
        <td className="px-2">
          <button onClick={onToggle}>
            {isOpen ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-2 font-medium">{r.inv.invoice_number}</td>
        <td className="px-3 py-2">{formatDateDisplay(r.inv.issued_at)}</td>
        <td className="px-3 py-2">{r.inv.due_date ? formatDateDisplay(r.inv.due_date) : "—"}</td>
        <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(r.inv.total))}</td>
        <td className="px-3 py-2 text-right font-mono text-status-available">{formatCurrency(r.paid)}</td>
        <td className={`px-3 py-2 text-right font-mono ${r.balance > 0 ? "text-destructive" : ""}`}>
          {formatCurrency(r.balance)}
        </td>
        <td className="px-3 py-2"><StatusBadge status={r.inv.status} /></td>
        <td className="px-3 py-2 text-right">
          {r.balance > 0 && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/portal/invoices/${r.inv.id}/pago`}>Pagar</a>
            </Button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/30">
          <td colSpan={9} className="px-6 py-3">
            <PaymentDetailTable payments={r.payments} />
          </td>
        </tr>
      )}
    </>
  );
}

export function PortalInvoicesTable({ rows, expanded, onToggle }: Props) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground bg-muted/40">
        <tr>
          <th className="w-8"></th>
          <th className="text-left px-3 py-2">Factura #</th>
          <th className="text-left px-3 py-2">Emisión</th>
          <th className="text-left px-3 py-2">Vencimiento</th>
          <th className="text-right px-3 py-2">Total</th>
          <th className="text-right px-3 py-2">Pagado</th>
          <th className="text-right px-3 py-2">Saldo</th>
          <th className="text-left px-3 py-2">Estado</th>
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">Sin facturas</td></tr>
        )}
        {rows.map((r, idx) => (
          <InvoiceRow
            key={r.inv.id}
            row={r}
            idx={idx}
            isOpen={!!expanded[r.inv.id]}
            onToggle={() => onToggle(r.inv.id)}
          />
        ))}
      </tbody>
    </table>
  );
}

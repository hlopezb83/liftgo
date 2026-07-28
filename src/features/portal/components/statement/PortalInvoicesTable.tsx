import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  /** R6-B2: moneda del documento para mostrar badge USD/MXN. */
  moneda?: string;
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
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Método</TableHead>
          <TableHead>Referencia</TableHead>
          <TableHead className="text-right">Monto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell>{formatDateDisplay(p.payment_date)}</TableCell>
            <TableCell>{p.payment_method ?? "—"}</TableCell>
            <TableCell>{p.reference_number ?? "—"}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatCurrency(Number(p.amount))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InvoiceRow({ row, isOpen, onToggle }: { row: PortalInvoiceRow; isOpen: boolean; onToggle: () => void }) {
  const r = row;
  return (
    <>
      <TableRow>
        <TableCell className="px-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? "Ocultar pagos" : "Ver pagos"}
          >
            {isOpen ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-2">
            {r.inv.invoice_number}
            {r.moneda && r.moneda !== "MXN" && (
              <span className="rounded border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {r.moneda}
              </span>
            )}
          </span>
        </TableCell>
        <TableCell>{formatDateDisplay(r.inv.issued_at)}</TableCell>
        <TableCell>{r.inv.due_date ? formatDateDisplay(r.inv.due_date) : "—"}</TableCell>
        <TableCell className="text-right font-mono tabular-nums">{formatCurrency(Number(r.inv.total))}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-status-available">{formatCurrency(r.paid)}</TableCell>
        <TableCell
          className={`text-right font-mono tabular-nums ${r.balance > 0 ? "text-destructive" : ""}`}
        >
          {formatCurrency(r.balance)}
        </TableCell>
        <TableCell><StatusBadge status={r.inv.status} /></TableCell>
        <TableCell className="text-right">
          {r.balance > 0 && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/portal/invoices/${r.inv.id}/pago`}>Pagar</a>
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={9} className="px-6 py-3">
            <PaymentDetailTable payments={r.payments} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function PortalInvoicesTable({ rows, expanded, onToggle }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Factura #</TableHead>
          <TableHead>Emisión</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
              Sin facturas
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <InvoiceRow
            key={r.inv.id}
            row={r}
            isOpen={!!expanded[r.inv.id]}
            onToggle={() => onToggle(r.inv.id)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

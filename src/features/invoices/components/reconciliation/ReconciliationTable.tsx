import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

interface Row {
  id: string;
  invoice_number: string;
  issued_at: string;
  customer_name: string | null;
  cfdi_status: string | null;
  status: string;
  cfdi_uuid: string | null;
  facturapi_invoice_id: string | null;
  facturapi_env: string | null;
  total: number | string;
}

function EnvBadge({ env }: { env: string | null }) {
  if (env === "live") return <Badge variant="secondary">Producción</Badge>;
  if (env === "test") return <Badge variant="outline">Sandbox</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

function FiscalBadge({ cfdiStatus, status }: { cfdiStatus: string | null; status: string }) {
  if (cfdiStatus === "cancelled" || status === "cancelled")
    return <Badge variant="destructive">Cancelada</Badge>;
  if (cfdiStatus === "stamped") return <Badge>Timbrada</Badge>;
  if (status === "draft") return <Badge variant="outline">Borrador</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export function ReconciliationTable({ rows, isLoading }: { rows: Row[]; isLoading: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Folio interno</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Estado fiscal</TableHead>
          <TableHead>UUID SAT</TableHead>
          <TableHead>ID Facturapi</TableHead>
          <TableHead>Ambiente</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
            </TableRow>
          ))
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              Sin facturas en el rango seleccionado.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link to={`/invoices/${r.id}`} className="font-mono underline">
                  {r.invoice_number}
                </Link>
              </TableCell>
              <TableCell>{formatDateDisplay(r.issued_at)}</TableCell>
              <TableCell className="max-w-[220px] truncate">{r.customer_name ?? "—"}</TableCell>
              <TableCell><FiscalBadge cfdiStatus={r.cfdi_status} status={r.status} /></TableCell>
              <TableCell className="font-mono text-xs max-w-[220px] truncate" title={r.cfdi_uuid ?? undefined}>
                {r.cfdi_uuid ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs max-w-[180px] truncate" title={r.facturapi_invoice_id ?? undefined}>
                {r.facturapi_invoice_id ?? "—"}
              </TableCell>
              <TableCell><EnvBadge env={r.facturapi_env} /></TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(Number(r.total))}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

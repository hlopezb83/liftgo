import { useMemo } from "react";
import { Link } from "react-router";
import {
  DataTableV2,
  useLiftgoTable,
  type ColumnDef,
} from "@/components/dataTable/v2";
import { Badge } from "@/components/ui/badge";
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
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "invoice_number",
        header: "Folio interno",
        accessorKey: "invoice_number",
        cell: ({ row }) => (
          <Link to={`/invoices/${row.original.id}`} className="font-mono underline">
            {row.original.invoice_number}
          </Link>
        ),
      },
      {
        id: "issued_at",
        header: "Fecha",
        accessorKey: "issued_at",
        cell: ({ row }) => formatDateDisplay(row.original.issued_at),
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (r) => r.customer_name ?? "",
        cell: ({ row }) => (
          <span className="max-w-[220px] truncate inline-block align-middle">
            {row.original.customer_name ?? "—"}
          </span>
        ),
      },
      {
        id: "fiscal",
        header: "Estado fiscal",
        enableSorting: false,
        cell: ({ row }) => (
          <FiscalBadge cfdiStatus={row.original.cfdi_status} status={row.original.status} />
        ),
      },
      {
        id: "cfdi_uuid",
        header: "UUID SAT",
        accessorKey: "cfdi_uuid",
        cell: ({ row }) => (
          <span
            className="font-mono text-xs max-w-[220px] truncate inline-block align-middle"
            title={row.original.cfdi_uuid ?? undefined}
          >
            {row.original.cfdi_uuid ?? "—"}
          </span>
        ),
      },
      {
        id: "facturapi_invoice_id",
        header: "ID Facturapi",
        accessorKey: "facturapi_invoice_id",
        cell: ({ row }) => (
          <span
            className="font-mono text-xs max-w-[180px] truncate inline-block align-middle"
            title={row.original.facturapi_invoice_id ?? undefined}
          >
            {row.original.facturapi_invoice_id ?? "—"}
          </span>
        ),
      },
      {
        id: "env",
        header: "Ambiente",
        enableSorting: false,
        cell: ({ row }) => <EnvBadge env={row.original.facturapi_env} />,
      },
      {
        id: "total",
        header: "Total",
        meta: { align: "right" },
        accessorFn: (r) => Number(r.total),
        cell: ({ row }) => (
          <span className="text-right font-mono">{formatCurrency(Number(row.original.total))}</span>
        ),
      },
    ],
    [],
  );

  const table = useLiftgoTable<Row>({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "issued_at", desc: true }],
  });

  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="Sin facturas en el rango seleccionado."
    />
  );
}

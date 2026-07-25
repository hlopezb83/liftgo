import type { ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { toYMD } from "@/lib/date/toYMD";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, formatDateRange, parseDateLocal } from "@/lib/utils";
import { quoteStatusLabel as quoteLabel } from "../constants";
import { isPublicoGeneral } from "../hooks/quoteDetail/useQuoteDetailData";

// Definición externa de columnas del listado de cotizaciones. Extraído de
// QuotesPage.tsx en v7.226.3 para mantener el componente bajo el límite de
// 150 LOC de eslint (max-lines-per-function).
export function buildQuotesColumns<Q extends {
  id: string;
  quote_number: string;
  quote_type?: string | null;
  customer_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total: number;
  status: string;
  valid_until?: string | null;
}>(): ColumnDef<Q>[] {
  return [
    {
      id: "quote_number",
      header: "Cotización #",
      accessorKey: "quote_number",
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.quote_number}</span>,
    },
    {
      id: "type",
      header: "Tipo",
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.quote_type === "sale" ? "default" : "secondary"} className="text-xs">
          {STATUS_LABELS[row.original.quote_type || "rental"] || "Renta"}
        </Badge>
      ),
    },
    {
      id: "customer_name",
      header: "Cliente",
      accessorFn: (q) => q.customer_name || "",
      // v7.182: "Público en General" desaturado para reducir ruido cuando
      // domina la lista (patrón repetido en CFDI genéricos).
      cell: ({ row }) => {
        const name = row.original.customer_name;
        if (!name) return "—";
        if (isPublicoGeneral(name)) {
          return <span className="text-muted-foreground italic">{name}</span>;
        }
        return name;
      },
    },
    {
      id: "dates",
      header: "Fechas",
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateRange(row.original.start_date, row.original.end_date)}</span>,
    },
    {
      id: "total",
      header: "Total",
      accessorKey: "total",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total)}</span>,
    },
    {
      id: "status",
      header: "Estado",
      accessorKey: "status",
      cell: ({ row }) => {
        const q = row.original;
        // R7 Bloque 19b: badge "Vencida" para cotizaciones enviadas cuya vigencia pasó.
        const validUntil = q.valid_until ? parseDateLocal(q.valid_until) : null;
        const today = parseDateLocal(toYMD(new Date()));
        const isExpired = q.status === "sent" && !!validUntil && !!today && validUntil.getTime() < today.getTime();
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={q.status} label={quoteLabel(q.status)} />
            {isExpired && <Badge variant="destructive" className="text-3xs px-1.5 py-0">Vencida</Badge>}
          </div>
        );
      },
    },
    {
      id: "valid_until",
      header: "Vigencia",
      accessorFn: (q) => q.valid_until || "",
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDateDisplay(row.original.valid_until)}</span>,
    },
  ];
}

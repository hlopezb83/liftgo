import type { ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Untranslated } from "@/components/ui/Untranslated";
import { STATUS_LABELS } from "@/lib/constants";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateRange, nowMty, parseDateLocal } from "@/lib/utils";
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
      cell: ({ row }) => <Untranslated className="font-mono font-medium">{row.original.quote_number}</Untranslated>,
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
          return <Untranslated className="text-muted-foreground italic">{name}</Untranslated>;
        }
        return <Untranslated>{name}</Untranslated>;
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
      meta: { kind: "money" },
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
        // FIX B4: `new Date()` usaba el reloj/TZ del navegador; con un equipo mal
        // configurado la cotización se veía vencida un día antes. `nowMty()` fija
        // el "hoy" del negocio (America/Monterrey).
        const today = parseDateLocal(toYMD(nowMty()));
        const isExpired = q.status === "sent" && !!validUntil && !!today && validUntil.getTime() < today.getTime();
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={q.status} label={quoteLabel(q.status)} />
            {/* R14-FE-02/06: mismo lenguaje de badge (punto) que el resto de estados. */}
            {isExpired && <StatusBadge status="expired" label="Vencida" />}
          </div>
        );
      },
    },
    {
      id: "valid_until",
      header: "Vigencia",
      accessorFn: (q) => q.valid_until || "",
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDateMty(row.original.valid_until)}</span>,
    },
  ];
}

import { useMemo } from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@/components/dataTable/v2";
import { OpenLinkIcon } from "@/components/icons";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMtyDate } from "@/lib/utils";
import type { useMrrDetail } from "./useMrrDetail";

export type MrrItem = NonNullable<ReturnType<typeof useMrrDetail>["data"]>["items"][number];

const fmt = (d: string | null) => formatMtyDate(d, "dd MMM yyyy", APP_LOCALE);
export { fmt as formatMrrDate };

export function useMrrColumns(): ColumnDef<MrrItem>[] {
  return useMemo(
    () => [
      {
        id: "forklift_name",
        header: "Equipo",
        accessorKey: "forklift_name",
        cell: ({ row }) => (
          <Link
            to={`/fleet/${row.original.forklift_id}`}
            className="font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {row.original.forklift_name}
            <OpenLinkIcon className="h-3 w-3" />
          </Link>
        ),
      },
      {
        id: "model",
        header: "Modelo",
        accessorFn: (i) => `${i.manufacturer ?? ""} ${i.model ?? ""}`.trim(),
        cell: ({ row }) =>
          [row.original.manufacturer, row.original.model].filter(Boolean).join(" ") || "—",
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorKey: "customer_name",
        cell: ({ row }) =>
          row.original.customer_id ? (
            <Link
              to={`/customers/${row.original.customer_id}`}
              className="text-primary hover:underline"
            >
              {row.original.customer_name}
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin cliente</span>
          ),
      },
      {
        id: "booking_number",
        header: "Reserva",
        accessorKey: "booking_number",
        cell: ({ row }) => row.original.booking_number ?? "—",
      },
      {
        id: "start_date",
        header: "Periodo",
        accessorKey: "start_date",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {fmt(row.original.start_date)} – {fmt(row.original.end_date)}
          </span>
        ),
      },
      {
        id: "monthly_rate",
        header: "Tarifa Mensual",
        accessorKey: "monthly_rate",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-medium font-mono">
            {formatCurrency(row.original.monthly_rate)}
          </span>
        ),
      },
    ],
    [],
  );
}

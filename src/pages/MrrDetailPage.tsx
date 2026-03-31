import { Link } from "react-router-dom";
import { DollarSign, ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatCurrency";
import { useMrrDetail } from "@/hooks/useMrrDetail";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const fmt = (d: string | null) =>
  d ? format(parseISO(d), "dd MMM yyyy", { locale: es }) : "—";

export default function MrrDetailPage() {
  const { data, isLoading } = useMrrDetail();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ingreso Mensual Recurrente</h1>
          <p className="text-muted-foreground text-sm">
            Detalle de montacargas actualmente rentados
          </p>
        </div>
      </div>

      {/* MRR total card */}
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MRR Total</p>
            <p className="text-2xl font-bold">
              {isLoading ? "…" : formatCurrency(data?.total_mrr ?? 0)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montacargas Rentados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columnCount={6} rows={5} />
          ) : !data?.items.length ? (
            <div className="p-8">
              <EmptyState
                icon={DollarSign}
                title="Sin montacargas rentados"
                description="Actualmente no hay equipos con status 'rentado'."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Reserva</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Tarifa Mensual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.forklift_id}>
                    <TableCell>
                      <Link
                        to={`/fleet/${item.forklift_id}`}
                        className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {item.forklift_name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      {[item.manufacturer, item.model].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell>
                      {item.customer_id ? (
                        <Link
                          to={`/customers/${item.customer_id}`}
                          className="text-primary hover:underline"
                        >
                          {item.customer_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Sin cliente</span>
                      )}
                    </TableCell>
                    <TableCell>{item.booking_number ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt(item.start_date)} – {fmt(item.end_date)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.monthly_rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-bold">Total MRR</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(data.total_mrr)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

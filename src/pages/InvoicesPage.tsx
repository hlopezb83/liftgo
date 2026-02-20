import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useInvoices } from "@/hooks/useForkliftData";
import { formatCurrency } from "@/lib/formatCurrency";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";

const STATUSES = ["all", "draft", "sent", "partial", "paid", "overdue"] as const;

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = invoices?.filter((inv) => {
    if (status !== "all" && inv.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) || (inv.customer_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  if (isLoading) return <div className="p-6"><TableSkeleton rows={5} /></div>;

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Facturas"
        subtitle="Administrar facturación y pagos"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("facturas.csv", (filtered || []).map(inv => ({ "Factura #": inv.invoice_number, Cliente: inv.customer_name || "", Total: inv.total, Estado: inv.status, Emitida: inv.issued_at, Vencimiento: inv.due_date || "" })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <Button size="sm" onClick={() => navigate("/invoices/new")}><Plus className="h-4 w-4 mr-1" />Nueva Factura</Button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar facturas…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura #</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Emitida</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.customer_name || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(inv.total))}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.issued_at}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.due_date || "—"}</TableCell>
                    <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={7} message="No se encontraron facturas" />
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  );
}

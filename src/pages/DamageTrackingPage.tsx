import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { usePagination } from "@/hooks/usePagination";
import { PageHeader } from "@/components/PageHeader";
import { TablePagination } from "@/components/TablePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageActions } from "@/components/DamageActions";
import { DAMAGE_STATUSES } from "@/lib/constants";
import { Search } from "lucide-react";
import { format } from "date-fns";

export default function DamageTrackingPage() {
  const { data: records, isLoading } = useDamageRecords();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = records?.filter((r) => {
    const matchesSearch =
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      (r.forklifts?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.customers?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader title="Seguimiento de Daños" subtitle="Rastrea daños desde inspecciones hasta reparación y facturación" />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descripción, montacargas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {DAMAGE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Montacargas</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Costo Est.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.length > 0 ? paginatedItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.forklifts?.name || "—"}</TableCell>
                    <TableCell>{r.customers?.name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(r.estimated_cost)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell><DamageActions record={r} /></TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={7} message="No se encontraron registros de daños" />
                )}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  );
}
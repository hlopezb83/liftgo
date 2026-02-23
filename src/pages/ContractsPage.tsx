import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useContracts } from "@/hooks/useContracts";
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
import { Plus, Search, Eye, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUSES = ["all", "draft", "sent", "signed", "cancelled"] as const;

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const filtered = contracts?.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.contract_number.toLowerCase().includes(q) || (c.customer_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  if (isLoading) return <div className="p-6"><TableSkeleton rows={5} /></div>;

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contratos"
        subtitle="Administrar contratos de renta"
        action={<Button size="sm" onClick={() => navigate("/contracts/new")}><Plus className="h-4 w-4 mr-1" />Nuevo Contrato</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="flex-wrap">
            {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{{ all: "Todos", draft: "Borrador", sent: "Enviado", signed: "Firmado", cancelled: "Cancelado" }[s]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contratos…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          {paginatedItems.length > 0 ? paginatedItems.map((c) => (
            <Card key={c.id} className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/contracts/${c.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-semibold text-sm">{c.contract_number}</span>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-muted-foreground">{c.customer_name || "Sin cliente"}</p>
                {c.forklift_name && <p className="text-xs text-muted-foreground mt-1">Equipo: {c.forklift_name}</p>}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    {c.start_date || "—"} → {c.end_date || "—"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          )) : (
            <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No se encontraron contratos</CardContent></Card>
          )}
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato #</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contracts/${c.id}`)}>
                      <TableCell className="font-medium">{c.contract_number}</TableCell>
                      <TableCell>{c.customer_name || "—"}</TableCell>
                      <TableCell>{c.forklift_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.start_date || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.end_date || "—"}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRow colSpan={7} message="No se encontraron contratos" />
                )}
              </TableBody>
            </Table>
            <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </CardContent>
        </Card>
      )}
    </div>
    </PageTransition>
  );
}

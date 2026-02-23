import { useNavigate } from "react-router-dom";
import { STATUS_LABELS } from "@/lib/constants";
import { useContracts } from "@/hooks/useContracts";
import { usePagination } from "@/hooks/usePagination";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Plus, Eye, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUSES = ["all", "draft", "sent", "signed", "cancelled"] as const;

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(contracts, {
    searchFields: ["contract_number", "customer_name"],
    statusField: "status",
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  const mobileContent = isMobile ? (
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
    </div>
  ) : undefined;

  return (
    <ListPageLayout
      title="Contratos"
      subtitle="Administrar contratos de renta"
      actions={<Button size="sm" onClick={() => navigate("/contracts/new")}><Plus className="h-4 w-4 mr-1" />Nuevo Contrato</Button>}
      filters={
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="flex-wrap">
              {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{STATUS_LABELS[s] || s}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar contratos…" className="w-full sm:w-64" />
        </div>
      }
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron contratos"
      tableHeader={
        <TableRow>
          <TableHead>Contrato #</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Equipo</TableHead>
          <TableHead>Inicio</TableHead>
          <TableHead>Fin</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      }
      renderRow={(c) => (
        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contracts/${c.id}`)}>
          <TableCell className="font-medium">{c.contract_number}</TableCell>
          <TableCell>{c.customer_name || "—"}</TableCell>
          <TableCell>{c.forklift_name || "—"}</TableCell>
          <TableCell className="text-sm text-muted-foreground">{c.start_date || "—"}</TableCell>
          <TableCell className="text-sm text-muted-foreground">{c.end_date || "—"}</TableCell>
          <TableCell><StatusBadge status={c.status} /></TableCell>
          <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
        </TableRow>
      )}
      customContent={mobileContent}
    />
  );
}

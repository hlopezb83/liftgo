import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useForklifts } from "@/hooks/useForkliftData";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { formatCurrency } from "@/lib/formatCurrency";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { Search, PlusCircle, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES } from "@/lib/constants";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();

  const filtered = forklifts?.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.model.toLowerCase().includes(search.toLowerCase()) ||
      (f.manufacturer || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fleet Inventory"
        subtitle={`${forklifts?.length || 0} forklifts in fleet`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("fleet.csv", (filtered || []).map(f => ({ Name: f.name, Model: f.model, Manufacturer: f.manufacturer || "", Capacity: f.capacity_kg || "", Fuel: f.fuel_type || "", Status: f.status, "Daily Rate": f.daily_rate || 0 })))}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
            <Button onClick={() => navigate("/fleet/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Add Forklift</Button>
          </div>
        }
      />

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FORKLIFT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Fuel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Daily Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((f) => (
                  <TableRow
                    key={f.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary"
                    onClick={() => navigate(`/fleet/${f.id}`)}
                  >
                    <TableCell className="font-mono font-medium">{f.name}</TableCell>
                    <TableCell>{f.model}</TableCell>
                    <TableCell>{f.manufacturer || "—"}</TableCell>
                    <TableCell>{f.capacity_kg ? `${f.capacity_kg} kg` : "—"}</TableCell>
                    <TableCell>{f.fuel_type}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(f.daily_rate || 0)}/day</TableCell>
                  </TableRow>
                ))}
                {paginatedItems.length === 0 && <EmptyRow colSpan={7} message="No forklifts found" />}
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

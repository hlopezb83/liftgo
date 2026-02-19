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
import { Plus, Search, Eye } from "lucide-react";

const STATUSES = ["all", "draft", "sent", "signed", "cancelled"] as const;

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

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
        title="Contracts"
        subtitle="Manage rental agreements"
        action={<Button size="sm" onClick={() => navigate("/contracts/new")}><Plus className="h-4 w-4 mr-1" />New Contract</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            {STATUSES.map((s) => <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contracts…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
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
                <EmptyRow colSpan={7} message="No contracts found" />
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

import { useQuotes } from "@/hooks/useQuotes";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { PlusCircle } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"];

export default function QuotesPage() {
  const { data: quotes, isLoading } = useQuotes();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = quotes?.filter((q) => {
    const matchSearch = !search || q.quote_number.toLowerCase().includes(search.toLowerCase()) || q.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Quotations"
        subtitle="Create and manage customer quotes"
        action={<Button onClick={() => navigate("/quotes/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" />New Quote</Button>}
      />
      <div className="flex gap-3">
        <Input placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valid Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.length > 0 ? paginatedItems.map((q) => (
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/quotes/${q.id}`)}>
                      <TableCell className="font-mono font-medium">{q.quote_number}</TableCell>
                      <TableCell>{q.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm">{q.start_date} → {q.end_date}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(q.total)}</TableCell>
                      <TableCell><StatusBadge status={q.status} /></TableCell>
                      <TableCell>{q.valid_until || "—"}</TableCell>
                    </TableRow>
                  )) : (
                    <EmptyRow colSpan={6} message="No quotes yet" />
                  )}
                </TableBody>
              </Table>
              <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

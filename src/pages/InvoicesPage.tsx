import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoices } from "@/hooks/useForkliftData";
import { formatCurrency } from "@/lib/formatCurrency";
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

const STATUSES = ["all", "draft", "sent", "paid", "overdue"] as const;

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

  if (isLoading) return <div className="p-6"><TableSkeleton rows={5} /></div>;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Manage billing and track payments"
        action={<Button size="sm" onClick={() => navigate("/invoices/new")}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>}
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
          <Input placeholder="Search invoices…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered && filtered.length > 0 ? (
                filtered.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/invoices/${inv.id}`)}>
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
                <EmptyRow colSpan={7} message="No invoices found" />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

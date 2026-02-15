import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalInvoices() {
  const { invoices, isLoading } = useCustomerPortal();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">My Invoices</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                  >
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.issued_at}</TableCell>
                    <TableCell>{inv.due_date || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(inv.total))}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

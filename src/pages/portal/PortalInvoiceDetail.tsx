import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { formatCurrency } from "@/lib/formatCurrency";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, payments, isLoading } = useCustomerPortal();

  if (isLoading) return <Skeleton className="h-96" />;

  const invoice = invoices?.find((i) => i.id === id);
  const invoicePayments = payments?.filter((p) => p.invoice_id === id) || [];

  if (!invoice) {
    return <p className="text-muted-foreground">Invoice not found</p>;
  }

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = Number(invoice.total) - totalPaid;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/invoices")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={invoice.status} />
            <span className="text-sm text-muted-foreground">Issued: {invoice.issued_at}</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(Number(invoice.total))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-xl font-bold font-mono text-status-available">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`text-xl font-bold font-mono ${balance > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {lineItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{item.description || "—"}</TableCell>
                    <TableCell className="text-right">{item.quantity || 1}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(item.unit_price || 0))}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(item.amount || 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No line items</p>
          )}
          <div className="mt-4 border-t pt-3 space-y-1 text-sm text-right">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Tax ({invoice.tax_rate}%)</span>
              <span className="font-mono">{formatCurrency(Number(invoice.tax_amount))}</span>
            </div>
            <div className="flex justify-end gap-8 font-bold">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(Number(invoice.total))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicePayments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicePayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell>{p.payment_method || "—"}</TableCell>
                    <TableCell>{p.reference_number || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(p.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No payments recorded</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useParams, useNavigate } from "react-router-dom";
import { useInvoice, useUpdateInvoice } from "@/hooks/useForkliftData";
import { formatCurrency } from "@/lib/formatCurrency";
import { TotalsSummary } from "@/components/TotalsSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer, Send, CheckCircle, Edit } from "lucide-react";
import { InvoicePDFButton } from "@/components/InvoicePDFButton";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoice, isLoading } = useInvoice(id);
  const updateInvoice = useUpdateInvoice();

  const setStatus = (status: string, paidAt?: string) => {
    if (!id) return;
    updateInvoice.mutate(
      { id, status, ...(paidAt ? { paid_at: paidAt } : {}) },
      { onSuccess: () => toast.success(`Invoice marked as ${status}`) }
    );
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!invoice) return <div className="p-6 text-muted-foreground">Invoice not found</div>;

  const lineItems = (invoice.line_items as unknown as LineItem[]) || [];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            <StatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Mark Sent</Button>
            </>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <Button size="sm" onClick={() => setStatus("paid", new Date().toISOString().split("T")[0])}>
              <CheckCircle className="h-4 w-4 mr-1" />Mark Paid
            </Button>
          )}
          {id && <InvoicePDFButton invoiceId={id} />}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium">{invoice.customer_name || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dates</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Issued:</span> {invoice.issued_at}</p>
            <p><span className="text-muted-foreground">Due:</span> {invoice.due_date || "—"}</p>
            {invoice.paid_at && <p><span className="text-muted-foreground">Paid:</span> {invoice.paid_at}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Qty</TableHead>
                <TableHead className="w-32 text-right">Unit Price</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(item.unit_price))}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(item.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TotalsSummary
        subtotal={Number(invoice.subtotal)}
        taxRate={Number(invoice.tax_rate)}
        taxAmount={Number(invoice.tax_amount)}
        total={Number(invoice.total)}
      />

      {invoice.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{invoice.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

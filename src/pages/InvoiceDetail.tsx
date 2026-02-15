import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInvoice, useUpdateInvoice } from "@/hooks/useForkliftData";
import { useUpdateBooking } from "@/hooks/useBookings";
import { formatCurrency } from "@/lib/formatCurrency";
import { TotalsSummary } from "@/components/TotalsSummary";
import { CANCELLATION_REASONS } from "@/lib/satCatalogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Printer, Send, CheckCircle, Edit, Stamp, XCircle, Download } from "lucide-react";
import { InvoicePDFButton } from "@/components/InvoicePDFButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoice, isLoading, refetch } = useInvoice(id);
  const updateInvoice = useUpdateInvoice();
  const updateBooking = useUpdateBooking();
  const [stampLoading, setStampLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("02");
  const [cancelLoading, setCancelLoading] = useState(false);

  const setStatus = (status: string, paidAt?: string) => {
    if (!id) return;
    updateInvoice.mutate(
      { id, status, ...(paidAt ? { paid_at: paidAt } : {}) },
      {
        onSuccess: (data) => {
          toast.success(`Invoice marked as ${status}`);
          if (status === "paid" && data.booking_id) {
            updateBooking.mutate(
              { id: data.booking_id, status: "completed" },
              { onSuccess: () => toast.success("Linked booking marked as completed") }
            );
          }
        },
      }
    );
  };

  const handleStamp = async () => {
    if (!id) return;
    setStampLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stamp-cfdi", {
        body: { invoice_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`CFDI timbrado${data.stub ? " (modo prueba)" : ""} — UUID: ${data.cfdi_uuid}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Error al timbrar");
    } finally {
      setStampLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-cfdi", {
        body: { invoice_id: id, cancellation_reason: cancelReason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("CFDI cancelado");
      if (data?.warning) toast.warning(data.warning);
      setCancelDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Error al cancelar");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDownloadXml = () => {
    if (!invoice) return;
    const inv = invoice as any;
    if (!inv.cfdi_xml) return;
    const blob = new Blob([inv.cfdi_xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_number}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!invoice) return <div className="p-6 text-muted-foreground">Invoice not found</div>;

  const inv = invoice as any;
  const lineItems = (invoice.line_items as unknown as LineItem[]) || [];
  const cfdiStatus = inv.cfdi_status || "pending";

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            <div className="flex items-center gap-2">
              <StatusBadge status={invoice.status} />
              <StatusBadge status={cfdiStatus} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
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
          {cfdiStatus === "pending" && invoice.status !== "draft" && (
            <Button size="sm" variant="default" onClick={handleStamp} disabled={stampLoading}>
              <Stamp className="h-4 w-4 mr-1" />{stampLoading ? "Timbrando..." : "Timbrar CFDI"}
            </Button>
          )}
          {cfdiStatus === "stamped" && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadXml}>
                <Download className="h-4 w-4 mr-1" />XML
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setCancelDialogOpen(true)}>
                <XCircle className="h-4 w-4 mr-1" />Cancelar CFDI
              </Button>
            </>
          )}
          {id && <InvoicePDFButton invoiceId={id} />}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>

      {/* CFDI UUID display */}
      {inv.cfdi_uuid && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">UUID CFDI</p>
            <p className="font-mono text-sm">{inv.cfdi_uuid}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{invoice.customer_name || "—"}</p>
            {inv.receptor_rfc && <p><span className="text-muted-foreground">RFC:</span> {inv.receptor_rfc}</p>}
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

      {/* CFDI Fiscal Details */}
      {(inv.serie || inv.forma_pago || inv.metodo_pago) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos Fiscales</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {inv.serie && <div><span className="text-muted-foreground block">Serie</span>{inv.serie}</div>}
              {inv.folio && <div><span className="text-muted-foreground block">Folio</span>{inv.folio}</div>}
              {inv.forma_pago && <div><span className="text-muted-foreground block">Forma de Pago</span>{inv.forma_pago}</div>}
              {inv.metodo_pago && <div><span className="text-muted-foreground block">Método de Pago</span>{inv.metodo_pago}</div>}
              {inv.moneda && <div><span className="text-muted-foreground block">Moneda</span>{inv.moneda}</div>}
              {inv.uso_cfdi && <div><span className="text-muted-foreground block">Uso CFDI</span>{inv.uso_cfdi}</div>}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Cancel CFDI Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar CFDI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecciona el motivo de cancelación según el SAT.
            </p>
            {Number(invoice.total) > 1000 && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                ⚠️ Facturas mayores a $1,000 MXN requieren aprobación del receptor ante el SAT.
              </div>
            )}
            <Select value={cancelReason} onValueChange={setCancelReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Cerrar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelLoading}>
              {cancelLoading ? "Cancelando..." : "Confirmar Cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

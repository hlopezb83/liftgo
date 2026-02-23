import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInvoice, useUpdateInvoice } from "@/hooks/useForkliftData";
import { useUpdateBooking } from "@/hooks/useBookings";
import { usePayments } from "@/hooks/usePayments";
import { formatCurrency } from "@/lib/formatCurrency";
import { TotalsSummary } from "@/components/TotalsSummary";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { CANCELLATION_REASONS } from "@/lib/satCatalogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Printer, Send, CheckCircle, Edit, Stamp, XCircle, Download, DollarSign } from "lucide-react";
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
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const { data: payments } = usePayments(id);
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  const setStatus = (status: string, paidAt?: string) => {
    if (!id) return;
    updateInvoice.mutate(
      { id, status, ...(paidAt ? { paid_at: paidAt } : {}) },
      {
        onSuccess: (data) => {
          toast.success(`Factura marcada como ${status}`);
          if (status === "paid" && data.booking_id) {
            updateBooking.mutate(
              { id: data.booking_id, status: "completed" },
              { onSuccess: () => toast.success("Reserva vinculada marcada como completada") }
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al timbrar");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cancelar");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDownloadXml = () => {
    if (!invoice) return;
    if (!invoice.cfdi_xml) return;
    const blob = new Blob([invoice.cfdi_xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_number}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!invoice) return <div className="p-6 text-muted-foreground">Factura no encontrada</div>;

  const lineItems = (invoice.line_items as unknown as LineItem[]) || [];
  const cfdiStatus = invoice.cfdi_status || "pending";
  const balance = Number(invoice.total) - totalPaid;

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
              <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Editar</Button>
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
            </>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <Button size="sm" onClick={() => setStatus("paid", new Date().toISOString().split("T")[0])}>
              <CheckCircle className="h-4 w-4 mr-1" />Marcar Pagada
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
          {(invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "partial") && (
            <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(true)}>
              <DollarSign className="h-4 w-4 mr-1" />Registrar Pago
            </Button>
          )}
          {id && <InvoicePDFButton invoiceId={id} />}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
        </div>
      </div>

      {invoice.cfdi_uuid && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">UUID CFDI</p>
            <p className="font-mono text-sm">{invoice.cfdi_uuid}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{invoice.customer_name || "—"}</p>
            {invoice.receptor_rfc && <p><span className="text-muted-foreground">RFC:</span> {invoice.receptor_rfc}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Emitida:</span> {invoice.issued_at}</p>
            <p><span className="text-muted-foreground">Vencimiento:</span> {invoice.due_date || "—"}</p>
            {invoice.paid_at && <p><span className="text-muted-foreground">Pagada:</span> {invoice.paid_at}</p>}
          </CardContent>
        </Card>
      </div>

      {(invoice.serie || invoice.forma_pago || invoice.metodo_pago) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos Fiscales</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {invoice.serie && <div><span className="text-muted-foreground block">Serie</span>{invoice.serie}</div>}
              {invoice.folio && <div><span className="text-muted-foreground block">Folio</span>{invoice.folio}</div>}
              {invoice.forma_pago && <div><span className="text-muted-foreground block">Forma de Pago</span>{invoice.forma_pago}</div>}
              {invoice.metodo_pago && <div><span className="text-muted-foreground block">Método de Pago</span>{invoice.metodo_pago}</div>}
              {invoice.moneda && <div><span className="text-muted-foreground block">Moneda</span>{invoice.moneda}</div>}
              {invoice.uso_cfdi && <div><span className="text-muted-foreground block">Uso CFDI</span>{invoice.uso_cfdi}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-24 text-right">Cant.</TableHead>
                <TableHead className="w-32 text-right">Precio Unit.</TableHead>
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
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{invoice.notes}</p></CardContent>
        </Card>
      )}

      {totalPaid > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pagado</p>
                <p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                <p className={`text-lg font-mono font-bold ${balance <= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(balance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payments && payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.payment_date}</TableCell>
                    <TableCell className="text-sm capitalize">{p.payment_method || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference_number || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(p.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {id && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          invoiceId={id}
          balance={balance}
        />
      )}

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

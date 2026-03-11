import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/useInvoices";
import { useUpdateBooking } from "@/hooks/useBookings";
import { usePayments } from "@/hooks/usePayments";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { InvoiceFiscalDataCard } from "@/components/invoice-detail/InvoiceFiscalDataCard";
import { InvoicePaymentSummary } from "@/components/invoice-detail/InvoicePaymentSummary";
import { CancelCfdiDialog } from "@/components/invoice-detail/CancelCfdiDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesCard } from "@/components/NotesCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Printer, Send, CheckCircle, Edit, Stamp, XCircle, Download, DollarSign, MoreHorizontal, FileText, CalendarIcon, Trash2 } from "lucide-react";
import { InvoicePDFButton } from "@/components/InvoicePDFButton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RoleGuard } from "@/components/RoleGuard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, formatDateDisplay } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuote } from "@/hooks/useQuotes";
import { useBookings, type BookingWithForklift } from "@/hooks/useBookings";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoice, isLoading, refetch } = useInvoice(id);
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const updateBooking = useUpdateBooking();
  const [stampLoading, setStampLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [paidPopoverOpen, setPaidPopoverOpen] = useState(false);
  const { data: payments } = usePayments(id);
  const { data: userRole } = useUserRole();
  const quoteId = (invoice as any)?.quote_id;
  const { data: sourceQuote } = useQuote(quoteId || undefined);
  const bookingId = invoice?.booking_id;
  const { data: allBookings } = useBookings();
  const sourceBooking = allBookings?.find((b) => b.id === bookingId) as BookingWithForklift | undefined;
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
      const { data, error } = await supabase.functions.invoke("stamp-cfdi", { body: { invoice_id: id } });
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

  const handleDownloadXml = () => {
    if (!invoice?.cfdi_xml) return;
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
      <DetailPageHeader
        title={invoice.invoice_number}
        backTo="/invoices"
        badges={<><StatusBadge status={invoice.status} /><Badge className={cfdiStatus === "stamped" ? "bg-status-available text-white border-transparent" : cfdiStatus === "cancelled" ? "bg-destructive text-destructive-foreground border-transparent" : "bg-status-maintenance text-white border-transparent"}>{cfdiStatus === "pending" ? "Pendiente CFDI" : cfdiStatus === "stamped" ? "Timbrado" : cfdiStatus === "cancelled" ? "CFDI Cancelado" : cfdiStatus}</Badge></>}
        actions={
          <>
            {invoice.status === "draft" && (
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
            )}
            {(invoice.status === "sent" || invoice.status === "overdue") && (
              <Popover open={paidPopoverOpen} onOpenChange={setPaidPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm">
                    <CheckCircle className="h-4 w-4 mr-1" />Marcar Pagada
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 space-y-3" align="start">
                  <p className="text-sm font-medium">Fecha de pago</p>
                  <Calendar
                    mode="single"
                    selected={paidDate}
                    onSelect={(d) => { if (d) setPaidDate(d); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  <Button size="sm" className="w-full" onClick={() => { setStatus("paid", format(paidDate, "yyyy-MM-dd")); setPaidPopoverOpen(false); }}>
                    Confirmar
                  </Button>
                </PopoverContent>
              </Popover>
            )}
            {(invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "partial") && (
              <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(true)}>
                <DollarSign className="h-4 w-4 mr-1" />Registrar Pago
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4 mr-1" /> Acciones</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(invoice.status === "draft" || userRole === "admin") && (
                  <DropdownMenuItem onClick={() => navigate(`/invoices/${id}/edit`)}><Edit className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                )}
                {cfdiStatus === "pending" && invoice.status !== "draft" && (
                  <DropdownMenuItem onClick={handleStamp} disabled={stampLoading}>
                    <Stamp className="h-4 w-4 mr-2" /> {stampLoading ? "Timbrando..." : "Timbrar CFDI"}
                  </DropdownMenuItem>
                )}
                {cfdiStatus === "stamped" && (
                  <>
                    <DropdownMenuItem onClick={handleDownloadXml}><Download className="h-4 w-4 mr-2" /> Descargar XML</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCancelDialogOpen(true)} className="text-destructive focus:text-destructive">
                      <XCircle className="h-4 w-4 mr-2" /> Cancelar CFDI
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Imprimir</DropdownMenuItem>
                <RoleGuard allowedRoles={["admin", "administrativo"]}>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                  </DropdownMenuItem>
                </RoleGuard>
              </DropdownMenuContent>
            </DropdownMenu>
            {id && <InvoicePDFButton invoiceId={id} />}
          </>
        }
      />

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
            <p><span className="text-muted-foreground">Emitida:</span> {formatDateDisplay(invoice.issued_at)}</p>
            <p><span className="text-muted-foreground">Vencimiento:</span> {formatDateDisplay(invoice.due_date)}</p>
            {invoice.paid_at && <p><span className="text-muted-foreground">Pagada:</span> {formatDateDisplay(invoice.paid_at)}</p>}
          </CardContent>
        </Card>
      </div>

      {sourceQuote && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generada desde cotización:</span>
            <Link to={`/quotes/${sourceQuote.id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                {sourceQuote.quote_number}
              </Badge>
            </Link>
          </CardContent>
        </Card>
      )}

      {sourceBooking && (
        <Card>
          <CardContent className="py-3 space-y-1">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Generada desde reserva:</span>
              <Link to="/bookings">
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  {sourceBooking.forklifts?.name || "Reserva"}
                </Badge>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              {sourceBooking.forklifts?.name} — {formatDateDisplay(sourceBooking.start_date)} → {formatDateDisplay(sourceBooking.end_date)}
            </p>
          </CardContent>
        </Card>
      )}

      <InvoiceFiscalDataCard invoice={invoice} />
      <ReadOnlyLineItemsTable lineItems={lineItems} />
      <TotalsSummary subtotal={Number(invoice.subtotal)} taxRate={Number(invoice.tax_rate)} taxAmount={Number(invoice.tax_amount)} total={Number(invoice.total)} />

      {invoice.notes && (
        <NotesCard value={invoice.notes} readOnly />
      )}

      <InvoicePaymentSummary totalPaid={totalPaid} balance={balance} payments={payments || []} />

      {id && <RecordPaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} invoiceId={id} balance={balance} />}
      {id && <CancelCfdiDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen} invoiceId={id} invoiceTotal={Number(invoice.total)} onSuccess={refetch} />}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará la factura y sus datos asociados permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteInvoice.mutate(id!, { onSuccess: () => navigate("/invoices") })}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

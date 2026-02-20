import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuote, useUpdateQuote } from "@/hooks/useQuotes";
import { useCreateBooking } from "@/hooks/useBookings";
import { useCustomers } from "@/hooks/useCustomers";
import { formatCurrency } from "@/lib/formatCurrency";
import { TotalsSummary } from "@/components/TotalsSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PostBookingDeliveryDialog } from "@/components/PostBookingDeliveryDialog";
import { ArrowLeft, Edit, Send, CheckCircle, XCircle, BookOpen, Receipt } from "lucide-react";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";
import { useForklifts } from "@/hooks/useForklifts";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuote(id);
  const updateQuote = useUpdateQuote();
  const createBooking = useCreateBooking();
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();

  const [deliveryDialog, setDeliveryDialog] = useState<{
    bookingId: string; forkliftId: string; forkliftName: string; startDate: string; customerAddress: string | null;
  } | null>(null);

  const setStatus = (status: string) => {
    if (!id) return;
    updateQuote.mutate({ id, status }, { onSuccess: () => toast.success(`Cotización marcada como ${status}`) });
  };

  const convertToBooking = () => {
    if (!quote) return;
    createBooking.mutate(
      {
        forklift_id: quote.forklift_id!,
        start_date: quote.start_date,
        end_date: quote.end_date,
        customer_name: quote.customer_name,
        customer_id: quote.customer_id,
        status: "confirmed",
      },
      {
        onSuccess: (bookingId: string) => {
          updateQuote.mutate({ id: quote.id, status: "accepted" });
          toast.success("Reserva creada desde cotización");

          const fl = forklifts?.find((f) => f.id === quote.forklift_id);
          const cust = customers?.find((c) => c.id === quote.customer_id);
          setDeliveryDialog({
            bookingId,
            forkliftId: quote.forklift_id!,
            forkliftName: fl?.name || "Montacargas",
            startDate: quote.start_date,
            customerAddress: cust?.address || null,
          });
        },
      }
    );
  };

  const convertToInvoice = () => {
    if (!quote) return;
    navigate(`/invoices/new?from_quote=${quote.id}`);
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!quote) return <div className="p-6 text-muted-foreground">Cotización no encontrada</div>;

  const lineItems = (quote.line_items as unknown as LineItem[]) || [];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/quotes")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{quote.quote_number}</h1>
            <StatusBadge status={quote.status} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quote.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Editar</Button>
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
            </>
          )}
          {(quote.status === "draft" || quote.status === "sent" || quote.status === "accepted") && (
            <>
              <Button size="sm" variant="default" onClick={convertToBooking}><BookOpen className="h-4 w-4 mr-1" />Convertir a Reserva</Button>
              <Button size="sm" variant="outline" onClick={convertToInvoice}><Receipt className="h-4 w-4 mr-1" />Convertir a Factura</Button>
            </>
          )}
          {quote.status === "sent" && (
            <>
              <Button size="sm" variant="default" onClick={() => setStatus("accepted")}><CheckCircle className="h-4 w-4 mr-1" />Aceptar</Button>
              <Button size="sm" variant="destructive" onClick={() => setStatus("declined")}><XCircle className="h-4 w-4 mr-1" />Rechazar</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent><p className="font-medium">{quote.customer_name || "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Periodo:</span> {quote.start_date} → {quote.end_date}</p>
            <p><span className="text-muted-foreground">Válida Hasta:</span> {quote.valid_until || "—"}</p>
          </CardContent>
        </Card>
      </div>

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
        subtotal={quote.subtotal}
        taxRate={quote.tax_rate}
        taxAmount={quote.tax_amount}
        total={quote.total}
      />

      {quote.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{quote.notes}</p></CardContent>
        </Card>
      )}

      {deliveryDialog && (
        <PostBookingDeliveryDialog
          open={!!deliveryDialog}
          onOpenChange={(open) => { if (!open) setDeliveryDialog(null); }}
          bookingId={deliveryDialog.bookingId}
          forkliftId={deliveryDialog.forkliftId}
          forkliftName={deliveryDialog.forkliftName}
          startDate={deliveryDialog.startDate}
          customerAddress={deliveryDialog.customerAddress}
          onSkip={() => { setDeliveryDialog(null); navigate("/calendar"); }}
        />
      )}
    </div>
  );
}

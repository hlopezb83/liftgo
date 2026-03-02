import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useQuote, useUpdateQuote, useDeleteQuote } from "@/hooks/useQuotes";
import { useCreateBooking } from "@/hooks/useBookings";
import { useCustomers } from "@/hooks/useCustomers";
import { supabase } from "@/integrations/supabase/client";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { PostBookingDeliveryDialog } from "@/components/PostBookingDeliveryDialog";
import { Edit, Send, CheckCircle, XCircle, BookOpen, Receipt, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";
import { useForklifts } from "@/hooks/useForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { QuotePDFButton } from "@/components/QuotePDFButton";
import { STATUS_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { AssignForkliftsCard } from "@/components/AssignForkliftsCard";
import { formatDateDisplay } from "@/lib/utils";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuote(id);
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const createBooking = useCreateBooking();
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();

  type DeliveryInfo = { bookingId: string; forkliftId: string; forkliftName: string; startDate: string; customerAddress: string | null };
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryInfo[]>([]);
  const [currentDeliveryIndex, setCurrentDeliveryIndex] = useState(0);

  const handleDeliveryNext = () => {
    if (currentDeliveryIndex < pendingDeliveries.length - 1) {
      setCurrentDeliveryIndex((prev) => prev + 1);
    } else {
      setPendingDeliveries([]);
      setCurrentDeliveryIndex(0);
      navigate("/calendar");
    }
  };

  // Check if bookings already exist for this quote
  const { data: linkedBookings } = useQuery({
    queryKey: ["bookings_for_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id").eq("quote_id", id!);
      return data || [];
    },
  });
  const alreadyConverted = (linkedBookings?.length ?? 0) > 0;

  const quoteType = (quote as any)?.quote_type || "rental";
  const isSale = quoteType === "sale";

  const setStatus = (status: string) => {
    if (!id) return;
    updateQuote.mutate({ id, status }, { onSuccess: () => toast.success(`Cotización marcada como ${status}`) });
  };

  const [isConverting, setIsConverting] = useState(false);

  const convertToBooking = async () => {
    if (!quote || !forklifts) return;
    const lineItems = (quote.line_items as unknown as LineItem[]) || [];

    // Extract all forklift IDs from line_items by matching description to forklift name
    const forkliftIds: string[] = [];
    for (const item of lineItems) {
      const matched = forklifts.find((f) => item.description?.includes(f.name));
      if (matched && !forkliftIds.includes(matched.id)) {
        forkliftIds.push(matched.id);
      }
    }

    // Fallback to quote.forklift_id if no matches found
    if (forkliftIds.length === 0 && quote.forklift_id) {
      forkliftIds.push(quote.forklift_id);
    }

    if (forkliftIds.length === 0) {
      toast.error("No se encontraron montacargas para crear reservas");
      return;
    }

    setIsConverting(true);
    try {
      const createdBookingIds: string[] = [];
      for (const fId of forkliftIds) {
        const bookingId = await createBooking.mutateAsync({
          forklift_id: fId,
          start_date: quote.start_date!,
          end_date: quote.end_date!,
          customer_name: quote.customer_name,
          customer_id: quote.customer_id,
          status: "confirmed",
        });
        // Link booking to this quote
        await supabase.from("bookings").update({ quote_id: quote.id } as any).eq("id", bookingId);
        createdBookingIds.push(bookingId);
      }

      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${createdBookingIds.length} reserva(s) creada(s) desde cotización`);

      // Build delivery queue for all bookings
      const cust = customers?.find((c) => c.id === quote.customer_id);
      const deliveries: DeliveryInfo[] = forkliftIds.map((fId, i) => {
        const fl = forklifts.find((f) => f.id === fId);
        return {
          bookingId: createdBookingIds[i],
          forkliftId: fId,
          forkliftName: fl?.name || "Montacargas",
          startDate: quote.start_date!,
          customerAddress: cust?.address || null,
        };
      });
      setCurrentDeliveryIndex(0);
      setPendingDeliveries(deliveries);
    } catch (err: any) {
      toast.error(`Error al crear reserva: ${err.message}`);
    } finally {
      setIsConverting(false);
    }
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
      <DetailPageHeader
        title={quote.quote_number}
        backTo="/quotes"
        badges={
          <div className="flex gap-2 items-center">
            <StatusBadge status={quote.status} />
            <Badge variant={isSale ? "default" : "secondary"}>{STATUS_LABELS[quoteType] || quoteType}</Badge>
          </div>
        }
        actions={
          <>
            <QuotePDFButton quoteId={quote.id} />
            {quote.status === "draft" && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Editar</Button>
                <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
              </>
            )}
            {!isSale && !alreadyConverted && (quote.status === "draft" || quote.status === "sent" || quote.status === "accepted") && (
              <Button size="sm" variant="default" onClick={convertToBooking} disabled={isConverting}><BookOpen className="h-4 w-4 mr-1" />{isConverting ? "Creando reservas..." : "Convertir a Reserva"}</Button>
            )}
            {alreadyConverted && (
              <Button size="sm" variant="outline" disabled className="opacity-70"><BookOpen className="h-4 w-4 mr-1" />Ya convertida a Reserva</Button>
            )}
            {(quote.status === "draft" || quote.status === "sent" || quote.status === "accepted") && (
              <Button size="sm" variant="outline" onClick={convertToInvoice}><Receipt className="h-4 w-4 mr-1" />Convertir a Factura</Button>
            )}
            {quote.status === "sent" && (
              <>
                <Button size="sm" variant="default" onClick={() => setStatus("accepted")}><CheckCircle className="h-4 w-4 mr-1" />Aceptar</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus("declined")}><XCircle className="h-4 w-4 mr-1" />Rechazar</Button>
              </>
            )}
            <RoleGuard allowed={["admin"]}>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" />Eliminar</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar cotización?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente la cotización {quote.quote_number}.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteQuote.mutate(id!, {
                        onSuccess: async () => {
                          toast.success("Cotización eliminada");
                          navigate("/quotes");
                        },
                        onError: (err: Error) => toast.error(err.message),
                      })}
                    >Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </RoleGuard>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent><p className="font-medium">{quote.customer_name || "—"}</p></CardContent>
        </Card>
        {!isSale ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Periodo:</span> {formatDateDisplay(quote.start_date)} → {formatDateDisplay(quote.end_date)}</p>
              <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(quote.valid_until)}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Vigencia</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(quote.valid_until)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <ReadOnlyLineItemsTable lineItems={lineItems} />

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

      {isSale && quote.status === "accepted" && (
        <AssignForkliftsCard quoteId={quote.id} lineItems={lineItems} />
      )}

      {pendingDeliveries.length > 0 && pendingDeliveries[currentDeliveryIndex] && (
        <PostBookingDeliveryDialog
          open
          onOpenChange={(open) => { if (!open) handleDeliveryNext(); }}
          bookingId={pendingDeliveries[currentDeliveryIndex].bookingId}
          forkliftId={pendingDeliveries[currentDeliveryIndex].forkliftId}
          forkliftName={pendingDeliveries[currentDeliveryIndex].forkliftName}
          startDate={pendingDeliveries[currentDeliveryIndex].startDate}
          customerAddress={pendingDeliveries[currentDeliveryIndex].customerAddress}
          onSkip={handleDeliveryNext}
          currentIndex={currentDeliveryIndex}
          totalCount={pendingDeliveries.length}
        />
      )}
    </div>
  );
}

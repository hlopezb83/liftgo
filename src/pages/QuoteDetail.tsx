import { useParams, useNavigate } from "react-router-dom";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesCard } from "@/components/NotesCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { PostBookingDeliveryDialog } from "@/components/bookings/PostBookingDeliveryDialog";
import { Edit, Send, CheckCircle, XCircle, BookOpen, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { QuotePDFButton } from "@/components/quotes/QuotePDFButton";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { STATUS_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { AssignForkliftsCard } from "@/components/quotes/AssignForkliftsCard";
import { EquipmentAssignmentDialog } from "@/components/quotes/EquipmentAssignmentDialog";
import { formatDateDisplay } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useQuoteDetailLogic } from "@/hooks/useQuoteDetailLogic";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const logic = useQuoteDetailLogic(id);

  const {
    quote, isLoading, lineItems, customerMatch, quoteType, isSale,
    alreadyConverted, durationDays, rentalMeta, customers, forklifts, equipmentModels,
    isConverting, showRecurringDialog, setShowRecurringDialog,
    showCustomerReassignDialog, setShowCustomerReassignDialog,
    reassignCustomerId, setReassignCustomerId, reassignCustomerName, setReassignCustomerName,
    showAssignmentDialog, setShowAssignmentDialog,
    pendingDeliveries, currentDeliveryIndex,
    setStatus, handleDelete, handleConvertClick, handleReassignConfirm,
    handleRecurringChoice, handleAssignmentConfirm, handleDeliveryNext,
    isPublicoGeneral,
  } = logic;

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!quote) return <div className="p-6 text-muted-foreground">Cotización no encontrada</div>;

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
            {(quote.status === "draft" || quote.status === "sent") && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Editar</Button>
            )}
            {quote.status === "draft" && (
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
            )}
            {!isSale && !alreadyConverted && (quote.status === "draft" || quote.status === "sent" || quote.status === "accepted") && (
              <Button size="sm" variant="default" onClick={handleConvertClick} disabled={isConverting}><BookOpen className="h-4 w-4 mr-1" />{isConverting ? "Creando reservas..." : "Convertir a Reserva"}</Button>
            )}
            {alreadyConverted && (
              <Button size="sm" variant="outline" disabled className="opacity-70"><BookOpen className="h-4 w-4 mr-1" />Ya convertida a Reserva</Button>
            )}
            {quote.status === "sent" && (
              <>
                <Button size="sm" variant="default" onClick={() => setStatus("accepted")}><CheckCircle className="h-4 w-4 mr-1" />Aceptar</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus("declined")}><XCircle className="h-4 w-4 mr-1" />Rechazar</Button>
              </>
            )}
            <RoleGuard module="Cotizaciones" minAccess="full">
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
                      onClick={handleDelete}
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
          <CardContent>
            <p className="font-medium">{quote.customer_name || "—"}</p>
            {customerMatch?.rfc && <p className="text-sm text-muted-foreground">RFC: {customerMatch.rfc}</p>}
            {customerMatch?.domicilio_fiscal_cp && <p className="text-sm text-muted-foreground">C.P. {customerMatch.domicilio_fiscal_cp}</p>}
          </CardContent>
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

      {quote.notes && <NotesCard value={quote.notes} readOnly />}

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

      <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Facturación Recurrente</DialogTitle>
            <DialogDescription>
              Esta cotización cubre un periodo de {Math.round(durationDays / 30)} mes(es) ({durationDays} días).
              ¿Desea habilitar la facturación recurrente mensual para las reservas que se crearán?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleRecurringChoice(false)}>No, crear sin recurrente</Button>
            <Button onClick={() => handleRecurringChoice(true)}>Sí, habilitar recurrente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCustomerReassignDialog} onOpenChange={setShowCustomerReassignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Cliente</DialogTitle>
            <DialogDescription>
              Esta cotización está asignada a "Público en General". Selecciona el cliente final antes de convertir a reserva.
            </DialogDescription>
          </DialogHeader>
          <CustomerSelector
            customers={customers?.filter(c => !isPublicoGeneral(c.name))}
            customerId={reassignCustomerId}
            customerName={reassignCustomerName}
            onCustomerIdChange={setReassignCustomerId}
            onCustomerNameChange={setReassignCustomerName}
            required
            hideManualName
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerReassignDialog(false)}>Cancelar</Button>
            <Button onClick={handleReassignConfirm} disabled={!reassignCustomerId}>Confirmar y Convertir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAssignmentDialog && equipmentModels && forklifts && (
        <EquipmentAssignmentDialog
          open={showAssignmentDialog}
          onOpenChange={setShowAssignmentDialog}
          rentalMeta={rentalMeta}
          models={equipmentModels}
          forklifts={forklifts}
          onConfirm={handleAssignmentConfirm}
          isLoading={isConverting}
        />
      )}
    </div>
  );
}

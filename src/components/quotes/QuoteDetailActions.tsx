import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/components/RoleGuard";
import { QuotePDFButton } from "@/components/quotes/QuotePDFButton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Edit, Send, CheckCircle, XCircle, BookOpen, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  quote: Tables<"quotes">;
  isSale: boolean;
  alreadyConverted: boolean;
  isConverting: boolean;
  onSetStatus: (status: string) => void;
  onConvertClick: () => void;
  onDelete: () => void;
}

export function QuoteDetailActions({
  quote, isSale, alreadyConverted, isConverting, onSetStatus, onConvertClick, onDelete,
}: Props) {
  const navigate = useNavigate();

  return (
    <>
      <QuotePDFButton quoteId={quote.id} />
      {(quote.status === "draft" || quote.status === "sent") && (
        <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
          <Edit className="h-4 w-4 mr-1" />Editar
        </Button>
      )}
      {quote.status === "draft" && (
        <Button size="sm" onClick={() => onSetStatus("sent")}>
          <Send className="h-4 w-4 mr-1" />Marcar Enviada
        </Button>
      )}
      {!isSale && !alreadyConverted && (quote.status === "draft" || quote.status === "sent" || quote.status === "accepted") && (
        <Button size="sm" variant="default" onClick={onConvertClick} disabled={isConverting}>
          <BookOpen className="h-4 w-4 mr-1" />{isConverting ? "Creando reservas..." : "Convertir a Reserva"}
        </Button>
      )}
      {alreadyConverted && (
        <Button size="sm" variant="outline" disabled className="opacity-70">
          <BookOpen className="h-4 w-4 mr-1" />Ya convertida a Reserva
        </Button>
      )}
      {quote.status === "sent" && (
        <>
          <Button size="sm" variant="default" onClick={() => onSetStatus("accepted")}>
            <CheckCircle className="h-4 w-4 mr-1" />Aceptar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onSetStatus("declined")}>
            <XCircle className="h-4 w-4 mr-1" />Rechazar
          </Button>
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
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará permanentemente la cotización {quote.quote_number}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </RoleGuard>
    </>
  );
}

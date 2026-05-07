import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/components/RoleGuard";
import { useDeleteProspect, useUpdateProspect, type Prospect } from "@/hooks/useProspects";
import { useProspectGuard } from "@/hooks/crm/useProspectGuard";
import { CloseWonDialog } from "./CloseWonDialog";
import { CloseLostDialog } from "./CloseLostDialog";
import { LOST_REASON_LABELS } from "@/lib/constants/crm";
import { formatCurrency } from "@/lib/formatCurrency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, Building2, User, Mail, Phone, DollarSign, FileText, StickyNote, Trophy, XCircle, RotateCcw } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

const STAGE_COLORS: Record<string, string> = {
  nuevo_prospecto: "default",
  contactado: "secondary",
  cotizacion_enviada: "outline",
  negociacion: "secondary",
  cerrado_ganado: "default",
  cerrado_perdido: "destructive",
};

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (prospect: Prospect) => void;
  quoteNumber?: string;
}

export function ProspectDetailSheet({ prospect, open, onOpenChange, onEdit, quoteNumber }: Props) {
  const deleteProspect = useDeleteProspect();
  const updateProspect = useUpdateProspect();
  const { canCloseDeal, assertCanClose } = useProspectGuard();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  if (!prospect) return null;

  const isClosed = prospect.stage === "cerrado_ganado" || prospect.stage === "cerrado_perdido";

  const handleDelete = () => {
    deleteProspect.mutate(prospect.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const handleReopen = () => {
    updateProspect.mutate(
      { id: prospect.id, stage: "negociacion" },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {prospect.company_name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Badge variant={(STAGE_COLORS[prospect.stage] as "default" | "secondary" | "outline" | "destructive") || "outline"}>
            {STAGE_LABELS[prospect.stage] || prospect.stage}
          </Badge>

          <div className="space-y-1">
            <DetailRow icon={User} label="Contacto" value={prospect.contact_person} />
            <DetailRow icon={Mail} label="Email" value={prospect.email} />
            <DetailRow icon={Phone} label="Teléfono" value={prospect.phone} />
            <DetailRow icon={DollarSign} label="Valor Estimado" value={formatCurrency(prospect.deal_value ?? 0)} />
          </div>

          {prospect.quote_id && quoteNumber && (
            <>
              <Separator />
              <div className="flex items-start gap-3 py-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Cotización Vinculada</p>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-accent gap-1 mt-1"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/quotes/${prospect.quote_id}`);
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    {quoteNumber}
                  </Badge>
                </div>
              </div>
            </>
          )}

          {prospect.notes && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Notas</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{prospect.notes}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            {prospect.created_by_name && <p>Creado por: {prospect.created_by_name}</p>}
            {prospect.created_at && <p>Creado: {format(new Date(prospect.created_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>}
            {prospect.updated_at && <p>Actualizado: {format(new Date(prospect.updated_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>}
          </div>

          {isClosed && (
            <>
              <Separator />
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                <p className="font-semibold text-sm">Información de cierre</p>
                {prospect.closed_at && (
                  <p>Fecha cierre: <span className="font-medium">{format(new Date(prospect.closed_at), "dd MMM yyyy", { locale: es })}</span></p>
                )}
                {prospect.stage === "cerrado_ganado" && prospect.final_amount != null && (
                  <p>Monto final: <span className="font-medium">{formatCurrency(prospect.final_amount)}</span></p>
                )}
                {prospect.stage === "cerrado_perdido" && prospect.lost_reason && (
                  <p>Razón: <span className="font-medium">{LOST_REASON_LABELS[prospect.lost_reason] ?? prospect.lost_reason}</span></p>
                )}
              </div>
            </>
          )}

          <Separator />
          <RoleGuard module="CRM / Prospectos" minAccess="full">
            <div className="space-y-2">
              {!isClosed && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      if (!assertCanClose("save")) return;
                      setWonOpen(true);
                    }}
                    className="bg-success hover:bg-success/90 text-success-foreground"
                    disabled={!canCloseDeal}
                  >
                    <Trophy className="h-4 w-4 mr-1" /> Ganado
                  </Button>
                  <Button variant="destructive" onClick={() => setLostOpen(true)}>
                    <XCircle className="h-4 w-4 mr-1" /> Perdido
                  </Button>
                </div>
              )}
              {isClosed && (
                <Button variant="outline" className="w-full" onClick={handleReopen} disabled={updateProspect.isPending}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reabrir deal
                </Button>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { onEdit(prospect); onOpenChange(false); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="flex-1 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar prospecto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente el prospecto "{prospect.company_name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={deleteProspect.isPending}>
                        {deleteProspect.isPending ? "Eliminando..." : "Eliminar"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </RoleGuard>
        </div>

        <CloseWonDialog
          prospect={prospect}
          open={wonOpen}
          onOpenChange={setWonOpen}
          isPending={updateProspect.isPending}
          onConfirm={(payload) => {
            updateProspect.mutate(
              { id: prospect.id, stage: "cerrado_ganado", ...payload },
              { onSuccess: () => { setWonOpen(false); onOpenChange(false); } }
            );
          }}
        />

        <CloseLostDialog
          prospect={prospect}
          open={lostOpen}
          onOpenChange={setLostOpen}
          isPending={updateProspect.isPending}
          onConfirm={(payload) => {
            updateProspect.mutate(
              { id: prospect.id, stage: "cerrado_perdido", ...payload },
              { onSuccess: () => { setLostOpen(false); onOpenChange(false); } }
            );
          }}
        />
        </div>
      </SheetContent>
    </Sheet>
  );
}

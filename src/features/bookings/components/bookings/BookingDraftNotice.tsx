import { useId, useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { Button } from "@/components/ui/button";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
import { cn } from "@/lib/utils";
import type { useBookingDraft } from "../../hooks/bookingForm/useBookingDraft";

export function BookingDraftNotice({ draft, busy }: { draft: ReturnType<typeof useBookingDraft>; busy: boolean }) {
  const confirm = useConfirm();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const detailsId = useId();
  const discardCapture = async (reload: boolean) => {
    if (draft.hasChanges && !await confirm({
      title: "¿Descartar esta captura?", description: "Se perderán los campos capturados en esta pestaña. No se elimina ninguna reserva creada.",
      confirmLabel: "Descartar captura", cancelLabel: "Seguir editando", destructive: true,
    })) return;
    if (reload) draft.reload(); else draft.discard();
  };
  const conflict = draft.status === "conflict";
  const expired = draft.status === "expired";
  const needsAttention = ["conflict", "expired", "unavailable", "created-unavailable"].includes(draft.status);
  const actionClassName = "h-auto min-h-11 whitespace-normal text-left lg:min-h-9";
  return (
    <section aria-label="Borrador de reserva" className="rounded-lg border bg-muted/40 p-3 lg:p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium" role={needsAttention ? "alert" : "status"}>
          {draftMessage(draft)}
        </p>
        <Button type="button" variant="ghost" size="sm" aria-label="Detalles del borrador" aria-controls={detailsId} aria-expanded={detailsExpanded} onClick={() => setDetailsExpanded((current) => !current)} className="h-11 shrink-0 px-2 lg:hidden">Detalles</Button>
      </div>
      <p id={detailsId} className={cn("text-xs text-muted-foreground", !detailsExpanded && "hidden lg:block")}>
        Se recuperan las fechas de inicio y fin, el equipo, el cliente seleccionado y la recurrencia.
        El nombre libre y el contacto no se guardan por privacidad. No se crea ni se aparta ningún equipo hasta pulsar Crear reserva.
        El borrador se elimina al cerrar sesión o cambiar de usuario o empresa.
      </p>
      {draft.expiresAt && !expired && !draft.status.startsWith("created") && <p className="text-xs">Caduca: {formatDateTimeMty(new Date(draft.expiresAt))}. Restaurarlo no amplía el plazo.</p>}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {draft.candidate && <Button type="button" size="sm" className={actionClassName} onClick={draft.restore} disabled={busy}>Restaurar borrador</Button>}
        {(draft.candidate || draft.hasChanges) && !conflict && !draft.status.startsWith("created") &&
          <Button type="button" variant="outline" size="sm" className={actionClassName} onClick={() => void discardCapture(false)} disabled={busy}>Descartar borrador y captura</Button>}
        {(conflict || expired) && <Button type="button" variant="outline" size="sm" className={actionClassName} onClick={() => void discardCapture(true)} disabled={busy}>Descartar mi captura y revisar borrador actual</Button>}
      </div>
    </section>
  );
}

function draftMessage(draft: ReturnType<typeof useBookingDraft>) {
  if (draft.candidate) return "Tienes un borrador local pendiente";
  const messages: Partial<Record<typeof draft.status, string>> = {
    saved: "Borrador guardado en este navegador",
    created: "Reserva creada; borrador eliminado",
    "created-unavailable": "Reserva creada, pero el navegador impidió limpiar la copia local. No restaures este borrador antiguo.",
    unavailable: "No se pudo guardar el borrador en este navegador. Puedes seguir capturando, pero no cierres esta página.",
    conflict: "El borrador cambió o se eliminó en otra pestaña. Esta captura no se guardará ni se enviará.",
    expired: "El borrador caducó. La captura visible no se ha enviado ni se volverá a guardar automáticamente.",
  };
  return messages[draft.status] ?? "Autoguardado local por un máximo de 7 días";
}

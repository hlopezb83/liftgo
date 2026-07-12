import { useState } from "react";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { PhoneCall, AddIcon, CalendarIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
import { formatDateDisplay } from "@/lib/utils";
import { useCollectionNotes, useCreateCollectionNote } from "../../hooks/invoices/collections/useCollectionNotes";

interface CollectionNotesCardProps {
  invoiceId: string;
}

export function CollectionNotesCard({ invoiceId }: CollectionNotesCardProps) {
  const { data: notes, isLoading } = useCollectionNotes(invoiceId);
  const createNote = useCreateCollectionNote();
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [followupDate, setFollowupDate] = useState<Date | undefined>(undefined);

  const handleSubmit = () => {
    if (!noteText.trim()) return;
    createNote.mutate(
      { invoice_id: invoiceId, note: noteText.trim(), next_followup_date: toYMD(followupDate) ?? null },
      { onSuccess: () => { setNoteText(""); setFollowupDate(undefined); setShowForm(false); } }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4" /> Gestiones de Cobranza
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            <AddIcon className="h-4 w-4 mr-1" /> Nueva Gestión
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1.5">
              <Label>Nota de seguimiento</Label>
              <Textarea
                placeholder="Ej: Se habló con el contacto, prometió pago para el viernes..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
              />
            </div>
            <DatePickerField
              label="Próximo seguimiento (opcional)"
              date={followupDate}
              onSelect={setFollowupDate}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={createNote.isPending || !noteText.trim()}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {notes && notes.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin gestiones registradas</p>
        )}
        {notes && notes.map((n) => (
          <div key={n.id} className="p-3 rounded-lg bg-muted/40 space-y-1">
            <p className="text-sm">{n.note}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{n.created_at ? formatDateTimeMty(n.created_at) : "—"}</span>
              {n.next_followup_date && (
                <span className="flex items-center gap-1 text-primary">
                  <CalendarIcon className="h-3 w-3" /> Seguimiento: {formatDateDisplay(n.next_followup_date)}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import type { Prospect } from "@/hooks/useProspects";

const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: Prospect | null;
  defaultStage?: string;
  overrideStage?: string;
  onSave: (data: {
    company_name: string;
    contact_person: string;
    email: string;
    phone: string;
    deal_value: number;
    notes: string;
    stage: string;
  }) => void;
  onDelete?: () => void;
}

export function ProspectFormDialog({ open, onOpenChange, prospect, defaultStage = "nuevo_prospecto", overrideStage, onSave, onDelete }: Props) {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (prospect) {
      setCompany(prospect.company_name);
      setContact(prospect.contact_person ?? "");
      setEmail(prospect.email ?? "");
      setPhone(prospect.phone ?? "");
      setDealValue(String(prospect.deal_value ?? 0));
      setNotes(prospect.notes ?? "");
    } else {
      setCompany(""); setContact(""); setEmail(""); setPhone(""); setDealValue(""); setNotes("");
    }
  }, [prospect, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      company_name: company,
      contact_person: contact,
      email,
      phone,
      deal_value: parseFloat(dealValue) || 0,
      notes,
      stage: overrideStage ?? prospect?.stage ?? defaultStage,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prospect ? "Editar Prospecto" : "Nuevo Prospecto"}</DialogTitle>
          <DialogDescription>
            {prospect ? "Actualiza la información del prospecto." : "Agrega un nuevo prospecto al pipeline."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company">Empresa *</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">Persona de Contacto</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deal">Valor del Trato (MXN)</Label>
            <Input id="deal" type="number" min="0" step="0.01" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {prospect && onDelete && (
              <Button type="button" variant="destructive" size="sm" onClick={() => { onDelete(); onOpenChange(false); }}>
                Eliminar
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

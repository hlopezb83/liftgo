import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useReportDamageForm } from "@/features/damage/hooks/useReportDamageForm";
import { DamageEvidenceSection } from "@/features/damage/components/damage/DamageEvidenceSection";

function getReportButtonLabel(previewsCount: number): string {
  if (previewsCount === 0) return "Reportar";
  if (previewsCount === 1) return "Reportar (1 foto)";
  return `Reportar (${previewsCount} fotos)`;
}

export function ReportDamageDialog() {
  const [open, setOpen] = useState(false);
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const form = useReportDamageForm(() => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Reportar Daño
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reportar Daño Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Montacargas *</Label>
            <Select value={form.forkliftId} onValueChange={form.setForkliftId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar montacargas" /></SelectTrigger>
              <SelectContent>
                {forklifts?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.manufacturer} {f.model} — {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente (opcional)</Label>
            <Select value={form.customerId} onValueChange={form.setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Sin cliente asociado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cliente</SelectItem>
                {customers?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción del daño *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              placeholder="Describe el daño encontrado..."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Costo estimado (opcional)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.estimatedCost}
              onChange={(e) => form.setEstimatedCost(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <DamageEvidenceSection
            previews={form.previews}
            onDrop={form.onDrop}
            onRemove={form.removePreview}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={form.handleSubmit} disabled={form.isProcessing}>
            {form.isProcessing
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando…</>
              : getReportButtonLabel(form.previews.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

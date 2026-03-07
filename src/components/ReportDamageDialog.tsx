import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { useForklifts } from "@/hooks/useForklifts";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateDamageRecord } from "@/hooks/useDamageRecords";
import { toast } from "@/hooks/use-toast";

export function ReportDamageDialog() {
  const [open, setOpen] = useState(false);
  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const createDamage = useCreateDamageRecord();

  const reset = () => {
    setForkliftId("");
    setCustomerId("");
    setDescription("");
    setEstimatedCost("");
  };

  const handleSubmit = () => {
    if (!forkliftId || !description.trim()) {
      toast({ title: "Campos requeridos", description: "Selecciona un montacargas y describe el daño.", variant: "destructive" });
      return;
    }
    createDamage.mutate(
      {
        forklift_id: forkliftId,
        customer_id: customerId || null,
        description: description.trim(),
        estimated_cost: estimatedCost ? Number(estimatedCost) : 0,
        status: "reported",
      },
      {
        onSuccess: () => {
          toast({ title: "Daño reportado", description: "El registro de daño se creó correctamente." });
          reset();
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Reportar Daño
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar Daño Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Montacargas *</Label>
            <Select value={forkliftId} onValueChange={setForkliftId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar montacargas" />
              </SelectTrigger>
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
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin cliente asociado" />
              </SelectTrigger>
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createDamage.isPending}>
            {createDamage.isPending ? "Guardando…" : "Reportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

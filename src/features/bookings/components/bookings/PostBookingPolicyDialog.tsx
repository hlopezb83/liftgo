import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMaintenancePolicy } from "@/features/maintenance/hooks/maintenance/useMaintenancePolicies";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SERVICE_TYPES } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PostBookingPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forkliftId: string;
  forkliftName: string;
  onSkip: () => void;
}

export function PostBookingPolicyDialog({ open, onOpenChange, forkliftId, forkliftName, onSkip }: PostBookingPolicyDialogProps) {
  const createPolicy = useCreateMaintenancePolicy();
  const [showForm, setShowForm] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [serviceType, setServiceType] = useState("Póliza de Mantenimiento");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (!providerName.trim()) {
      toast.error("El nombre del proveedor es requerido");
      return;
    }
    createPolicy.mutate(
      {
        forklift_id: forkliftId,
        provider_name: providerName.trim(),
        monthly_cost: parseFloat(monthlyCost) || 0,
        service_type: serviceType,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Póliza de mantenimiento creada");
          onSkip();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Póliza de Mantenimiento
          </DialogTitle>
          <DialogDescription>
            El montacargas <span className="font-medium">{forkliftName}</span> no tiene una póliza de mantenimiento activa. ¿Deseas crear una?
          </DialogDescription>
        </DialogHeader>
        {!showForm ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setShowForm(true)}>
              <ShieldCheck className="h-4 w-4 mr-2" /> Crear Póliza
            </Button>
            <Button variant="outline" className="w-full" onClick={onSkip}>
              Omitir por Ahora
            </Button>
          </DialogFooter>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Proveedor *</Label>
                <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="Nombre del proveedor" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Costo Mensual</Label>
                  <Input type="number" min="0" step="0.01" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Servicio</Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción opcional de la póliza" rows={2} />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onSkip}>Omitir</Button>
              <Button onClick={handleCreate} disabled={createPolicy.isPending}>
                {createPolicy.isPending ? "Creando..." : "Crear Póliza"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

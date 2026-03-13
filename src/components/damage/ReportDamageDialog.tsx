import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { useForklifts } from "@/hooks/useForklifts";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateDamageRecord } from "@/hooks/useDamageRecords";
import { useUploadDocument } from "@/hooks/useDocuments";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ReportDamageDialog() {
  const [open, setOpen] = useState(false);
  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const createDamage = useCreateDamageRecord();
  const uploadDoc = useUploadDocument();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPreviews = acceptedFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, 10));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    maxFiles: 10,
    multiple: true,
  });

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const reset = () => {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setForkliftId("");
    setCustomerId("");
    setDescription("");
    setEstimatedCost("");
    setPreviews([]);
  };

  const handleSubmit = async () => {
    if (!forkliftId || !description.trim()) {
      toast.error("Campos requeridos", { description: "Selecciona un montacargas y describe el daño." });
      return;
    }
    setSubmitting(true);
    try {
      const newRecord = await createDamage.mutateAsync({
        forklift_id: forkliftId,
        customer_id: customerId || null,
        description: description.trim(),
        estimated_cost: estimatedCost ? Number(estimatedCost) : 0,
        status: "reported",
      });

      if (previews.length > 0) {
        for (const { file } of previews) {
          await uploadDoc.mutateAsync({
            file,
            entityType: "damage_record",
            entityId: newRecord.id,
          });
        }
      }

      toast.success("Daño reportado", {
        description: previews.length > 0
          ? `Registro creado con ${previews.length} foto(s).`
          : "El registro de daño se creó correctamente.",
      });
      reset();
      setOpen(false);
    } catch {
      // errors handled by mutation hooks
    } finally {
      setSubmitting(false);
    }
  };

  const isProcessing = submitting || createDamage.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
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

          {/* Zona de fotos */}
          <div className="space-y-2">
            <Label>Fotos (opcional)</Label>
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              )}
            >
              <input {...getInputProps()} capture="environment" />
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "rounded-full p-2 transition-colors",
                  isDragActive ? "bg-primary/10" : "bg-muted"
                )}>
                  {isDragActive ? (
                    <Upload className="h-5 w-5 text-primary" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDragActive ? "Suelta las fotos aquí" : "Arrastra fotos o toca para abrir cámara"}
                </p>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {previews.map((p, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={p.url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePreview(i)}
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando…</> : `Reportar${previews.length > 0 ? ` (${previews.length} foto${previews.length > 1 ? "s" : ""})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

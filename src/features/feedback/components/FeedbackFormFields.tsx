import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type { FeedbackFormValues } from "@/features/feedback/lib/schema";
import { FEEDBACK_SEVERITY_LABELS } from "@/features/feedback/lib/constants";

interface Props {
  form: UseFormReturn<FeedbackFormValues>;
  modules: readonly string[];
  screenshot: File | null;
  onScreenshotChange: (file: File | null) => void;
}

export function FeedbackFormFields({ form, modules, screenshot, onScreenshotChange }: Props) {
  const type = form.watch("type");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= 5 * 1024 * 1024) onScreenshotChange(f);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as FeedbackFormValues["type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="improvement">Mejora</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Módulo</Label>
          <Select value={form.watch("module")} onValueChange={(v) => form.setValue("module", v as FeedbackFormValues["module"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {modules.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {type === "bug" && (
        <div className="space-y-1.5">
          <Label>Severidad</Label>
          <Select value={form.watch("severity") ?? "medium"} onValueChange={(v) => form.setValue("severity", v as FeedbackFormValues["severity"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FEEDBACK_SEVERITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Título</Label>
        <Input maxLength={120} {...form.register("title")} placeholder="Resumen breve" />
        {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea rows={5} maxLength={2000} {...form.register("description")} placeholder="¿Qué pasó? ¿Qué esperabas? Pasos para reproducir…" />
        {form.formState.errors.description && <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Captura (opcional, máx. 5MB)</Label>
        {screenshot ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="truncate">{screenshot.name}</span>
            <Button type="button" size="icon" variant="ghost" onClick={() => onScreenshotChange(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
            <ImagePlus className="h-4 w-4" />
            Adjuntar imagen
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        )}
      </div>
    </>
  );
}

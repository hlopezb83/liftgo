import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { useFeedbackContext } from "@/features/feedback/hooks/useFeedbackContext";
import { useCreateFeedback } from "@/features/feedback/hooks/useCreateFeedback";
import {
  feedbackFormSchema,
  type FeedbackFormValues,
} from "@/features/feedback/lib/schema";
import {
  FEEDBACK_INTERNAL_MODULES,
  FEEDBACK_PORTAL_MODULES,
  FEEDBACK_SEVERITY_LABELS,
} from "@/features/feedback/lib/constants";
import { ImagePlus, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultModule?: string;
}

export function FeedbackFormDialog({ open, onOpenChange, defaultModule }: Props) {
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const isCustomer = role === "customer";
  const modules = isCustomer ? FEEDBACK_PORTAL_MODULES : FEEDBACK_INTERNAL_MODULES;
  const captureContext = useFeedbackContext();
  const create = useCreateFeedback();
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      type: "bug",
      module: (defaultModule && modules.includes(defaultModule as never) ? defaultModule : modules[0]) as FeedbackFormValues["module"],
      severity: "medium",
      title: "",
      description: "",
    },
  });

  const type = form.watch("type");

  const onSubmit = (values: FeedbackFormValues) => {
    create.mutate(
      {
        values,
        context: captureContext(),
        reporterType: isCustomer ? "customer" : "internal",
        reporterName: user?.user_metadata?.full_name ?? user?.email ?? null,
        screenshot,
      },
      {
        onSuccess: () => {
          form.reset();
          setScreenshot(null);
          onOpenChange(false);
        },
      },
    );
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= 5 * 1024 * 1024) setScreenshot(f);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reportar bug o sugerir mejora</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <Button type="button" size="icon" variant="ghost" onClick={() => setScreenshot(null)}>
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

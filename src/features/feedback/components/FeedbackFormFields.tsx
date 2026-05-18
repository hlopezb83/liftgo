import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Target, X, Loader2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type { FeedbackFormValues } from "@/features/feedback/lib/schema";
import type { SelectedElementInfo } from "@/features/feedback/lib/cssPath";

interface Props {
  form: UseFormReturn<FeedbackFormValues>;
  route: string;
  selectedElement: SelectedElementInfo | null;
  screenshotPreview: string | null;
  isCapturing: boolean;
  onStartPicker: () => void;
  onClearElement: () => void;
}

export function FeedbackFormFields({
  form, route, selectedElement, screenshotPreview, isCapturing,
  onStartPicker, onClearElement,
}: Props) {
  const type = form.watch("type");

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={type === "bug" ? "default" : "outline"}
          onClick={() => form.setValue("type", "bug")}
          className="flex-1"
        >
          🐛 Bug
        </Button>
        <Button
          type="button"
          size="sm"
          variant={type === "improvement" ? "default" : "outline"}
          onClick={() => form.setValue("type", "improvement")}
          className="flex-1"
        >
          💡 Mejora
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{route}</span>
      </div>

      <div className="space-y-1.5">
        <Label>Título</Label>
        <Input maxLength={120} {...form.register("title")} placeholder="Resumen breve" />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea
          rows={4}
          maxLength={2000}
          {...form.register("description")}
          placeholder="¿Qué pasó? ¿Qué esperabas? Pasos para reproducir…"
        />
        {form.formState.errors.description && (
          <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Elemento señalado (opcional)</Label>
          {selectedElement && (
            <Button type="button" size="sm" variant="ghost" onClick={onClearElement} className="h-7 px-2 text-xs">
              <X className="h-3 w-3 mr-1" />Quitar
            </Button>
          )}
        </div>

        {selectedElement ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">{selectedElement.tagName}</Badge>
              {selectedElement.text && (
                <Badge variant="outline" className="text-xs max-w-full truncate">"{selectedElement.text}"</Badge>
              )}
            </div>
            {screenshotPreview && (
              <img
                src={screenshotPreview}
                alt="Captura con elemento marcado"
                className="w-full max-h-48 object-contain rounded border bg-muted/30"
              />
            )}
            <Button type="button" size="sm" variant="outline" onClick={onStartPicker} className="w-full" disabled={isCapturing}>
              {isCapturing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Target className="h-3.5 w-3.5 mr-1" />}
              Cambiar selección
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onStartPicker} className="w-full" disabled={isCapturing}>
            {isCapturing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Capturando…</>
            ) : (
              <><Target className="h-3.5 w-3.5 mr-1" />Señalar elemento en la página</>
            )}
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">
          Si no señalas nada, se incluirá automáticamente una captura de la pantalla al enviar.
        </p>
      </div>
    </>
  );
}

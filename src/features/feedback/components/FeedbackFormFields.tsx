import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LocationIcon, TargetIcon, X, SpinnerIcon } from "@/components/icons";
import type { UseFormReturn } from "react-hook-form";
import { TextField, TextareaField } from "@/components/forms/fields";
import type { FeedbackFormValues } from "../lib/schema";
import type { SelectedElementInfo } from "../lib/cssPath";

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
        <LocationIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{route}</span>
      </div>

      <TextField
        control={form.control}
        name="title"
        label="Título"
        placeholder="Resumen breve"
      />

      <TextareaField
        control={form.control}
        name="description"
        label="Descripción"
        rows={4}
        maxLength={2000}
        placeholder="¿Qué pasó? ¿Qué esperabas? Pasos para reproducir…"
      />

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
                className="w-full max-h-32 object-contain rounded border bg-muted/30"
              />
            )}
            <Button type="button" size="sm" variant="outline" onClick={onStartPicker} className="w-full" disabled={isCapturing}>
              {isCapturing ? <SpinnerIcon className="h-3.5 w-3.5 mr-1 animate-spin" /> : <TargetIcon className="h-3.5 w-3.5 mr-1" />}
              Cambiar selección
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onStartPicker} className="w-full" disabled={isCapturing}>
            {isCapturing ? (
              <><SpinnerIcon className="h-3.5 w-3.5 mr-1 animate-spin" />Capturando…</>
            ) : (
              <><TargetIcon className="h-3.5 w-3.5 mr-1" />Señalar elemento en la página</>
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

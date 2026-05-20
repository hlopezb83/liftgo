import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { useFeedbackContext } from "@/features/feedback/hooks/useFeedbackContext";
import { useCreateFeedback } from "@/features/feedback/hooks/useCreateFeedback";
import { feedbackFormSchema, type FeedbackFormValues } from "@/features/feedback/lib/schema";
import type { SelectedElementInfo } from "@/features/feedback/lib/cssPath";
import { captureScreenshotFile } from "@/features/feedback/lib/captureScreenshot";
import { FeedbackFormFields } from "./FeedbackFormFields";
import { ElementPicker } from "./ElementPicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function FeedbackFormDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const location = useLocation();
  const isCustomer = role === "customer";
  const captureContext = useFeedbackContext();
  const create = useCreateFeedback();

  const [picking, setPicking] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElementInfo | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: { type: "bug", title: "", description: "" },
  });

  const resetAll = useCallback(() => {
    form.reset();
    setSelectedElement(null);
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  }, [form, screenshotPreview]);

  const handlePick = useCallback(async (info: SelectedElementInfo) => {
    setPicking(false);
    setSelectedElement(info);
    setIsCapturing(true);
    // pequeño delay para que el overlay desaparezca antes del screenshot
    await new Promise((r) => setTimeout(r, 100));
    const file = await captureScreenshotFile({ highlightRect: info.rect });
    setIsCapturing(false);
    if (file) {
      setScreenshot(file);
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  }, [screenshotPreview]);

  const handleStartPicker = () => {
    setPicking(true);
  };

  const handleClearElement = () => {
    setSelectedElement(null);
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  };

  const onSubmit = async (values: FeedbackFormValues) => {
    let finalScreenshot = screenshot;
    if (!finalScreenshot) {
      setIsCapturing(true);
      finalScreenshot = await captureScreenshotFile();
      setIsCapturing(false);
    }

    create.mutate(
      {
        values,
        context: { ...captureContext(), selected_element: selectedElement ?? null },
        reporterType: isCustomer ? "customer" : "internal",
        reporterName: user?.user_metadata?.full_name ?? user?.email ?? null,
        screenshot: finalScreenshot,
      },
      {
        onSuccess: () => {
          resetAll();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <>
      <Dialog open={open && !picking} onOpenChange={(o) => { if (!o) { resetAll(); onOpenChange(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Reportar bug o sugerir mejora</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
              <FeedbackFormFields
                form={form}
                route={location.pathname + location.search}
                selectedElement={selectedElement}
                screenshotPreview={screenshotPreview}
                isCapturing={isCapturing}
                onStartPicker={handleStartPicker}
                onClearElement={handleClearElement}
              />
            </div>
            <DialogFooter className="shrink-0 border-t pt-3 mt-3">
              <Button type="button" variant="ghost" onClick={() => { resetAll(); onOpenChange(false); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || isCapturing}>
                {create.isPending ? "Enviando…" : isCapturing ? "Capturando…" : "Enviar reporte"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {picking && (
        <ElementPicker onPick={handlePick} onCancel={() => setPicking(false)} />
      )}
    </>
  );
}

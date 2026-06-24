import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "react-router-dom";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import { useFeedbackContext } from "../hooks/useFeedbackContext";
import { useCreateFeedback } from "../hooks/useCreateFeedback";
import { feedbackFormSchema, type FeedbackFormValues } from "../lib/schema";
import type { SelectedElementInfo } from "../lib/cssPath";
import { captureScreenshotFile } from "../lib/captureScreenshot";
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
      <FormDialog
        open={open && !picking}
        onOpenChange={(o) => { if (!o) { resetAll(); onOpenChange(false); } }}
        title="Reportar bug o sugerir mejora"
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FeedbackFormFields
            form={form}
            route={location.pathname + location.search}
            selectedElement={selectedElement}
            screenshotPreview={screenshotPreview}
            isCapturing={isCapturing}
            onStartPicker={handleStartPicker}
            onClearElement={handleClearElement}
          />
          <FormDialogFooter>
            <Button type="button" variant="ghost" onClick={() => { resetAll(); onOpenChange(false); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || isCapturing}>
              {create.isPending ? "Enviando…" : isCapturing ? "Capturando…" : "Enviar reporte"}
            </Button>
          </FormDialogFooter>
        </form>
      </FormDialog>

      {picking && (
        <ElementPicker onPick={handlePick} onCancel={() => setPicking(false)} />
      )}
    </>
  );
}

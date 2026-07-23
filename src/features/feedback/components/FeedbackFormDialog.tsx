import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useCreateFeedback } from "../hooks/useCreateFeedback";
import { useFeedbackContext } from "../hooks/useFeedbackContext";
import { captureScreenshotFile } from "../lib/captureScreenshot";
import { feedbackFormSchema, type FeedbackFormValues } from "../lib/schema";
import { ElementPicker } from "./ElementPicker";
import { FeedbackFormFields } from "./FeedbackFormFields";
import type { SelectedElementInfo } from "../lib/cssPath";

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

  const resetAll = () => {
    form.reset();
    setSelectedElement(null);
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  };

  const handlePick = async (info: SelectedElementInfo) => {
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
  };

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
      isPending={create.isPending || isCapturing}
        open={open && !picking}
        onOpenChange={(o) => { if (!o) { resetAll(); onOpenChange(false); } }}
        title="Reportar bug o sugerir mejora"
      >
        <Form {...form}>
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
        </Form>
      </FormDialog>

      {picking && (
        <ElementPicker onPick={handlePick} onCancel={() => setPicking(false)} />
      )}
    </>
  );
}

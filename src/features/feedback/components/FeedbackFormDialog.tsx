import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
} from "@/features/feedback/lib/constants";
import { FeedbackFormFields } from "./FeedbackFormFields";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reportar bug o sugerir mejora</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FeedbackFormFields
            form={form}
            modules={modules}
            screenshot={screenshot}
            onScreenshotChange={setScreenshot}
          />
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

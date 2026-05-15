import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackFormDialog } from "./FeedbackFormDialog";

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-5 right-5 z-40 h-12 rounded-full shadow-lg gap-2"
        aria-label="Reportar bug o sugerir mejora"
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="hidden sm:inline">Reportar</span>
      </Button>
      <FeedbackFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

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
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 px-2.5"
        aria-label="Reportar bug o sugerir mejora"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Reportar</span>
      </Button>
      <FeedbackFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

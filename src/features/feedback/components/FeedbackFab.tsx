import { lazy, Suspense, useState } from "react";
import { MessageSquarePlus } from "@/components/icons";
import { Button } from "@/components/ui/button";

// P3-11: FeedbackFormDialog arrastra react-day-picker + RHF + zod. Se carga
// perezosamente para no pesar sobre el bundle inicial del shell.
const FeedbackFormDialog = lazy(() =>
  import("./FeedbackFormDialog").then((m) => ({ default: m.FeedbackFormDialog })),
);

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => { setMounted(true); setOpen(true); }}
        onMouseEnter={() => setMounted(true)}
        className="h-8 gap-2 px-2.5 touch:h-11 touch:min-w-11"
        aria-label="Reportar bug o sugerir mejora"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Reportar</span>
      </Button>
      {mounted && (
        <Suspense fallback={null}>
          <FeedbackFormDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}

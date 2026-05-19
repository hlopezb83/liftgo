import { lazy, Suspense, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchQuotePdfData } from "@/lib/pdf/quote/build";
import { QuoteDocument, type QuoteDocumentProps } from "@/lib/pdf/documents/QuoteDocument";
import { toast } from "sonner";

const PDFViewer = lazy(() =>
  import("@react-pdf/renderer").then((m) => ({ default: m.PDFViewer })),
);

interface Props {
  quoteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuotePreviewDialog({ quoteId, open, onOpenChange }: Props) {
  const [data, setData] = useState<QuoteDocumentProps | null>(null);

  useEffect(() => {
    if (!open) { setData(null); return; }
    let cancelled = false;
    fetchQuotePdfData(quoteId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Error al cargar la cotización";
        toast.error(msg);
        onOpenChange(false);
      });
    return () => { cancelled = true; };
  }, [open, quoteId, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>Previsualización de Cotización</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted">
          {data ? (
            <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">Cargando visor…</div>}>
              <PDFViewer width="100%" height="100%" showToolbar style={{ border: 0 }}>
                <QuoteDocument {...data} />
              </PDFViewer>
            </Suspense>
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Preparando documento…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

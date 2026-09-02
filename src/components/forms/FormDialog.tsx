import { ReactNode, useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FormDialogCloseContext } from "./formDialogContext";


type Width = "sm" | "md" | "lg" | "xl" | "2xl";

const WIDTH_CLASS: Record<Width, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título visible: "Nuevo cliente", "Editar refacción", etc. */
  title: string;
  /** Descripción opcional debajo del título. */
  description?: ReactNode;
  /** Cuerpo del modal — incluye típicamente un `<form>` con `<FormSection>`s
   *  y, al final, un `<FormDialogFooter>` para mantener el footer sticky
   *  dentro del scope del `<form>`. */
  children: ReactNode;
  /** Ancho máximo. Default 'lg'. */
  width?: Width;
  /** Test id en el DialogContent. */
  testId?: string;
  /** Clases extra para DialogContent. */
  className?: string;
  /** R10 Bloque 11.1: cuando el submit está en curso, bloquea Esc y click
   *  fuera para evitar cerrar el diálogo con una mutación viva. */
  isPending?: boolean;
  /** Oleada 2 (B-2): si `true`, cerrar (Esc/click fuera/botón X) pide
   *  confirmación al usuario antes de descartar cambios. */
  isDirty?: boolean;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = "lg",
  testId,
  className,
  isPending = false,
  isDirty = false,
}: FormDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = useCallback(() => {
    if (isPending) return;
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }, [isPending, isDirty, onOpenChange]);

  // Referencia estable para no re-renderizar todo el árbol del formulario.
  const closeValue = useMemo(() => requestClose, [requestClose]);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (v) { onOpenChange(true); return; } requestClose(); }}>
        <DialogContent
          className={cn(WIDTH_CLASS[width], "max-h-[85vh] overflow-y-auto pb-0", className)}
          data-testid={testId}
          onEscapeKeyDown={(e) => { if (isPending || isDirty) e.preventDefault(); if (isDirty && !isPending) requestClose(); }}
          onInteractOutside={(e) => { if (isPending || isDirty) e.preventDefault(); if (isDirty && !isPending) requestClose(); }}
        >
          <DialogHeader className="sticky top-0 bg-background z-10 -mx-6 px-6 pb-3 border-b">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <FormDialogCloseContext.Provider value={closeValue}>
            {/* `pb-6` reemplaza el padding inferior que se le quitó al scrollport
                para que el footer sticky pueda pegarse al borde real del modal. */}
            <div className="pt-2 pb-6">{children}</div>
          </FormDialogCloseContext.Provider>


        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="¿Descartar cambios?"
        description="Los cambios no guardados se perderán."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        destructive
        onConfirm={() => { setConfirmDiscard(false); onOpenChange(false); }}
      />
    </>
  );
}


// Bloque 4.3 (R4): el footer sticky se superponía al último input del form.
// Ahora el footer es el último hijo del scroll, así que no hace falta padding
// extra debajo (antes `pb-20` dejaba un hueco muerto visible bajo las acciones).


/**
 * Footer sticky para usar al final del `<form>` dentro de `<FormDialog>`.
 * Garantiza que las acciones (Cancelar / CTA) siempre estén visibles
 * aunque el formulario haga scroll.
 */
export function FormDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  // El scrollport del diálogo tiene `p-6`: un `sticky bottom-0` se detiene
  // sobre ese padding y dejaba ~25px de contenido asomando por debajo del
  // footer. `-mb-6` + padding inferior extra hacen que el footer cubra hasta
  // el borde real del modal (incluye safe-area en móviles con notch).
  return (
    <DialogFooter
      className={cn(
        "sticky bottom-0 -mx-6 -mb-6 px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-card border-t",
        className,
      )}
    >
      {children}
    </DialogFooter>
  );
}


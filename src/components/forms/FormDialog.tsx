import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  /** Título visible: "Nuevo Cliente", "Editar Refacción", etc. */
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
}

/**
 * Shell estándar para modales de formulario.
 * Aplica: ancho consistente, scroll interno (max-h-[85vh]) y header sticky
 * con `border-b`. El cuerpo y el footer los maneja el caller (normalmente
 * un `<form>` con `<FormSection>`s y un `<FormDialogFooter>` al final).
 */
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
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && isPending) return; onOpenChange(v); }}>
      <DialogContent
        className={cn(WIDTH_CLASS[width], "max-h-[85vh] overflow-y-auto", className)}
        data-testid={testId}
        onEscapeKeyDown={(e) => { if (isPending) e.preventDefault(); }}
        onInteractOutside={(e) => { if (isPending) e.preventDefault(); }}
      >
        <DialogHeader className="sticky top-0 bg-background z-10 -mx-6 px-6 pb-3 border-b">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="pt-2 pb-16">{children}</div>
      </DialogContent>
    </Dialog>
  );
}


// Bloque 4.3 (R4): el footer sticky se superponía al último input del form.
// Compensamos con `pb-16` en el cuerpo scrollable para dejar espacio libre
// equivalente al alto del footer (py-3 + line-height ≈ 4rem).

/**
 * Footer sticky para usar al final del `<form>` dentro de `<FormDialog>`.
 * Garantiza que las acciones (Cancelar / CTA) siempre estén visibles
 * aunque el formulario haga scroll.
 */
export function FormDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DialogFooter className={cn("sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t", className)}>
      {children}
    </DialogFooter>
  );
}

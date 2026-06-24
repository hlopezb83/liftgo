import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormActions } from "./FormActions";
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
  /** Cuerpo del modal. Si `onSubmit` está presente se envuelve en un `<form>`. */
  children: ReactNode;
  /** Slot encima del contenido (típicamente `<Tabs>` o un dropzone). */
  topSlot?: ReactNode;
  /** Cuando se define, el modal renderiza un `<form>` y un footer estándar. */
  onSubmit?: () => void;
  submitLabel?: string;
  /** Reservado para uso futuro (FormActions ya rotula "Cancelar"). */
  cancelLabel?: string;
  isPending?: boolean;
  /** Permite reemplazar el footer (p.ej. botón destructivo + secundario). */
  footer?: ReactNode;
  /** Ancho máximo. Default 'lg'. */
  width?: Width;
  /** Test id en el DialogContent. */
  testId?: string;
  /** Clases extra para DialogContent. */
  className?: string;
}

/**
 * Shell estándar para modales de formulario.
 * Aplica: sticky header con border-b, sticky footer con border-t,
 * scroll interno (max-h-[85vh]), ancho consistente.
 *
 * Mantén el cuerpo en `<FormSection>` para conservar el ritmo visual.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  topSlot,
  onSubmit,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  isPending,
  footer,
  width = "lg",
  testId,
  className,
}: FormDialogProps) {
  const body = (
    <>
      {topSlot ? <div className="pt-2">{topSlot}</div> : null}
      <div className={cn("space-y-5", topSlot ? "mt-4" : "pt-2")}>{children}</div>
    </>
  );

  const footerSlot = footer ?? (onSubmit ? (
    <FormActions
      submitLabel={submitLabel}
      isPending={isPending ?? false}
      onCancel={() => onOpenChange(false)}
    />
  ) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(WIDTH_CLASS[width], "max-h-[85vh] overflow-y-auto", className)}
        data-testid={testId}
      >
        <DialogHeader className="sticky top-0 bg-background z-10 -mx-6 px-6 pb-3 border-b">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {onSubmit ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
            {body}
            {footerSlot ? (
              <DialogFooter className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t">
                {footerSlot}
              </DialogFooter>
            ) : null}
          </form>
        ) : (
          <>
            {body}
            {footerSlot ? (
              <DialogFooter className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t">
                {footerSlot}
              </DialogFooter>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

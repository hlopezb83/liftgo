import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./SectionHeading";

interface FormSectionProps {
  title: string;
  /** Si es la primera sección del formulario, no dibuja separador superior. */
  first?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Sección de formulario con encabezado small-caps y separador `border-t`.
 * Componer dentro del cuerpo de `<FormDialog>` para mantener un ritmo visual
 * consistente entre todos los modales de entidad.
 */
export function FormSection({ title, first, children, className }: FormSectionProps) {
  return (
    <div className={cn("space-y-3", !first && "border-t pt-4", className)}>
      <SectionHeading>{title}</SectionHeading>
      {children}
    </div>
  );
}

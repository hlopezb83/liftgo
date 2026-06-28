import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MaxWidth = "full" | "wide" | "form" | "narrow";

interface PageContainerProps {
  children: ReactNode;
  /**
   * - `full` (default): toma el ancho disponible del layout, ideal para listados y tablas.
   * - `wide`: máx. 5xl (vistas de detalle densas).
   * - `form`: máx. 3xl (formularios).
   * - `narrow`: máx. xl (vistas tipo auth/login).
   */
  maxWidth?: MaxWidth;
  className?: string;
}

const WIDTHS: Record<MaxWidth, string> = {
  full: "",
  wide: "max-w-5xl",
  form: "max-w-3xl",
  narrow: "max-w-xl",
};

/**
 * Envoltorio estándar de página: `space-y-6` y opcional `max-w-*`.
 * No aplica padding — eso lo provee `MainLayout`.
 */
export function PageContainer({ children, maxWidth = "full", className }: PageContainerProps) {
  return <div className={cn("space-y-6", WIDTHS[maxWidth], className)}>{children}</div>;
}

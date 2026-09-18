import { cn } from "@/lib/utils";

/**
 * Marca global de LiftGo: distintivo del producto usado en el shell del ERP,
 * el portal y la vista de impresión.
 *
 * Fuente **fija y local**: se dibuja desde el repositorio, idéntica para
 * cualquier empresa. NO consume `company_settings.logo_url` ni ninguna URL
 * remota: una URL libre permitiría renderizar un origen externo arbitrario.
 * El logo empresarial configurable vive en Configuración y en los documentos,
 * y se resuelve aparte con aislamiento por organización.
 */
interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

/** Iniciales de la marca del producto; constante del repositorio. */
export const GLOBAL_BRAND_INITIALS = "LG";
export const GLOBAL_BRAND_NAME = "LiftGo";

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <div
      aria-label={GLOBAL_BRAND_NAME}
      role="img"
      className={cn(
        "rounded-md bg-primary text-primary-foreground font-bold flex items-center justify-center shrink-0",
        SIZE[size],
        className,
      )}
    >
      {GLOBAL_BRAND_INITIALS}
    </div>
  );
}

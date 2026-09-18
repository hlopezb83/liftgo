import { cn } from "@/lib/utils";

/**
 * Marca global de LiftGo: distintivo gráfico del producto usado en el shell del
 * ERP, el portal y la vista de impresión.
 *
 * Fuente **fija y local**: el asset del repositorio (`public/favicon.png`),
 * idéntico para cualquier empresa. NO consume `company_settings.logo_url` ni
 * ninguna URL remota: una URL libre permitiría renderizar un origen externo
 * arbitrario. El logo empresarial configurable vive en Configuración y en los
 * documentos, y se resuelve aparte con aislamiento por organización.
 */
interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

/** Asset gráfico de marca servido desde el propio origen; nunca una URL externa. */
export const GLOBAL_BRAND_LOGO_SRC = "/favicon.png";
export const GLOBAL_BRAND_NAME = "LiftGo";

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <img
      src={GLOBAL_BRAND_LOGO_SRC}
      alt={GLOBAL_BRAND_NAME}
      className={cn("rounded-md object-contain shrink-0", SIZE[size], className)}
    />
  );
}

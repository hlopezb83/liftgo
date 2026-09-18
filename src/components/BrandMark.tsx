import {
  GLOBAL_BRAND_LOCKUP_PATH,
  GLOBAL_BRAND_MARK_PATH,
  GLOBAL_BRAND_NAME as BRAND_NAME,
} from "@/lib/branding/globalBrandLogo";
import { cn } from "@/lib/utils";

/**
 * Marca global de LiftGo: distintivo gráfico del producto usado en el shell del
 * ERP, el portal y la vista de impresión.
 *
 * Fuente **fija y local**: el asset del repositorio (`public/favicon.png`),
 * idéntico para cualquier empresa. NO consume `company_settings.logo_url` ni
 * ninguna URL remota: una URL libre permitiría renderizar un origen externo
 * arbitrario. Ninguna organización tiene logo propio: los documentos usan el
 * mismo asset global (ver `@/lib/pdf/assets/logo`).
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
export const GLOBAL_BRAND_LOGO_SRC = GLOBAL_BRAND_MARK_PATH;
/**
 * Lockup oficial «LIFT GO MONTACARGAS» entregado por el propietario. Asset
 * local versionado del repositorio: única fuente de la marca global del
 * producto, idéntica en todas las empresas.
 */
export const GLOBAL_BRAND_LOCKUP_SRC = GLOBAL_BRAND_LOCKUP_PATH;
export const GLOBAL_BRAND_NAME = BRAND_NAME;

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <img
      src={GLOBAL_BRAND_LOGO_SRC}
      alt={GLOBAL_BRAND_NAME}
      className={cn(
        "rounded-md object-contain shrink-0",
        SIZE[size],
        className,
      )}
    />
  );
}

const LOCKUP_SIZE: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-11",
};

/**
 * Marca global expandida: el lockup gráfico completo. Mantiene la proporción
 * con `object-contain` y ancho automático (no se recorta ni se estira).
 */
export function BrandLockup({ size = "md", className }: BrandMarkProps) {
  return (
    <img
      src={GLOBAL_BRAND_LOCKUP_SRC}
      alt={`${GLOBAL_BRAND_NAME} Montacargas`}
      className={cn(
        "w-auto max-w-full object-contain shrink-0",
        LOCKUP_SIZE[size],
        className,
      )}
    />
  );
}

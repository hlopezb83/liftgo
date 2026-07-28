import { cn } from "@/lib/utils";
import { usePublicBranding } from "@/features/company-settings";

/**
 * R21 C-4: marca compacta usada en sidebar, portal login y vista de impresión.
 * Muestra el logo del tenant si existe; si no, un cuadro con las iniciales
 * sobre `bg-primary text-primary-foreground` para mantener contraste.
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

function getInitials(name: string | null | undefined): string {
  if (!name) return "LG";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "LG";
}

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const { data } = usePublicBranding();
  const logoUrl = data?.logo_url ?? null;
  const name = data?.razon_social ?? "LiftGo";
  const initials = getInitials(name);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn("rounded-md object-contain bg-background", SIZE[size], className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-primary text-primary-foreground font-bold flex items-center justify-center shrink-0",
        SIZE[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}

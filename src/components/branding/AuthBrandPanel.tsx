import { BrandMark, GLOBAL_BRAND_NAME } from "@/components/BrandMark";

interface AuthBrandPanelProps {
  tagline: string;
}

/**
 * Panel de marca para las pantallas de acceso (staff y portal).
 *
 * Usa SIEMPRE la marca global de LiftGo (`BrandMark`, asset local fijo) y el
 * nombre global. NO acepta ni renderiza `company_settings.logo_url`: ese logo
 * empresarial es configurable por empresa y sólo se usa en Configuración y en
 * los documentos fiscales/PDF, con resolver aislado por organización.
 */
export function AuthBrandPanel({ tagline }: AuthBrandPanelProps) {
  return (
    <aside className="hidden lg:flex flex-col justify-between w-[42%] max-w-xl bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-sidebar-primary/15 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <BrandMark size="lg" />
        <span className="auth-display text-base font-bold text-sidebar-primary-foreground">
          {GLOBAL_BRAND_NAME}
        </span>
      </div>
      <div className="relative space-y-4">
        <span className="block h-1 w-16 rounded-full bg-sidebar-primary" />
        <h2 className="auth-display text-3xl font-extrabold leading-tight text-sidebar-primary-foreground">
          {tagline}
        </h2>
        <p className="text-sm text-sidebar-foreground/75 max-w-sm">
          Flota, rentas, mantenimiento y facturación en un solo lugar.
        </p>
      </div>
      <p className="relative auth-display text-3xs text-sidebar-foreground/60">
        LiftGo · Monterrey, México
      </p>
    </aside>
  );
}

interface AuthBrandPanelProps {
  logoUrl?: string | null;
  razonSocial?: string | null;
  tagline: string;
}

/**
 * R12 UI/UX Fase 3: panel de marca para las pantallas de acceso (staff y
 * portal). Navy estructural + acento dorado; oculto en móvil para no robar
 * espacio al formulario.
 */
export function AuthBrandPanel({ logoUrl, razonSocial, tagline }: AuthBrandPanelProps) {
  return (
    <aside className="hidden lg:flex flex-col justify-between w-[42%] max-w-xl bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-sidebar-primary/15 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`Logo ${razonSocial ?? "LiftGo"}`}
            className="h-12 w-auto max-w-[200px] object-contain"
          />
        ) : (
          /* Distintivo tipográfico al estilo del sitio público. */
          <span className="flex flex-col leading-none">
            <span className="auth-display text-2xl font-extrabold text-sidebar-primary-foreground">
              Lift Go
            </span>
            <span className="auth-display text-2xs text-sidebar-primary">Montacargas</span>
          </span>
        )}
        {logoUrl && (
          <span className="auth-display text-base font-bold text-sidebar-primary-foreground">
            {razonSocial ?? "LiftGo"}
          </span>
        )}
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

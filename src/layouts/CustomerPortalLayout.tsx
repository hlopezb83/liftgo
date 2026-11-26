import { useRef } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { LogOut, Menu, DashboardIcon, CalendarDays, InvoiceIcon, DocumentIcon, MessageSquare, TrophyIcon, VerifiedDocIcon, ExpenseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicBranding } from "@/features/company-settings";
import { FeedbackFab } from "@/features/feedback";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { OfflineBanner } from "@/layouts/OfflineBanner";
import { useLocation } from "@/lib/router-compat";
import { Link, Outlet } from "@/lib/router-compat-ui";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/portal", label: "Panel", icon: DashboardIcon },
  { path: "/portal/rentals", label: "Rentas", icon: CalendarDays },
  { path: "/portal/quotes", label: "Cotizaciones", icon: VerifiedDocIcon },
  { path: "/portal/invoices", label: "Facturas", icon: InvoiceIcon },
  { path: "/portal/estado-cuenta", label: "Estado de cuenta", icon: ExpenseIcon },
  { path: "/portal/contracts", label: "Contratos", icon: DocumentIcon },
  { path: "/portal/mis-reportes", label: "Mis reportes", icon: MessageSquare },
  { path: "/portal/leaderboard", label: "Tabla de honor", icon: TrophyIcon },
];

export default function CustomerPortalLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const { user, signOut } = useAuth();
  const { data: company } = usePublicBranding();
  const location = useLocation();
  const navigate = useNavigateTransition();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="h-[100dvh] max-w-full overflow-x-clip bg-background flex flex-col">
      <Link
        to={`${location.pathname}${location.search}#portal-main-content`}
        state={location.state}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          mainRef.current?.focus({ preventScroll: true });
          mainRef.current?.scrollTo({ top: 0 });
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Saltar al contenido
      </Link>
      <OfflineBanner inline />
      {/* Header sticky con la marca global de LiftGo (asset local fijo, igual
          en toda organización) vía BrandLockup. La razón social que la
          acompaña es texto legal de la organización, no branding propio. */}
      <header data-app-header className="sticky top-0 z-30 h-14 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 flex items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLockup size="sm" />
          <span className="font-semibold text-foreground truncate">
            {company?.razon_social ? `${company.razon_social} · Portal` : "LiftGo · Portal"}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-52">
            {user?.email}
          </span>
          {/* R7-FE-09a (N7-POR-04): en <768px las pestañas del final quedan
              ocultas tras scroll horizontal sin afordancia; hamburguesa con
              TODAS las secciones (la barra scrollable se conserva). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="md:hidden min-h-11 min-w-11" aria-label="Menú de secciones">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tabs.map((tab) => (
                <DropdownMenuItem key={tab.path} onSelect={() => navigate(tab.path)}>
                  <tab.icon className="h-4 w-4 mr-2" /> {tab.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Cerrar sesión
          </Button>
        </div>
      </header>

      {/*
       * Bloque 2.3 (v7.146.0): la barra de tabs debe scrollear dentro de sí
       * misma en móvil (overflow-x-auto + shrink-0 en cada tab) para no
       * empujar el ancho del documento y romper el viewport a 390px.
       */}
      <nav data-app-header aria-label="Secciones del portal" className="border-b bg-card">
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-6 [-webkit-overflow-scrolling:touch]">
          {tabs.map((tab) => {
            const isActive =
              tab.path === "/portal"
                ? location.pathname === "/portal"
                : location.pathname.startsWith(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-4 py-2.5 touch:min-h-11 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main ref={mainRef} id="portal-main-content" tabIndex={-1} className="flex-1 overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {/* Oleada 3 (C-2): ancho de lectura consistente en todas las páginas del portal. */}
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
      <FeedbackFab />
    </div>
  );
}

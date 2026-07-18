import { Link, Outlet, useLocation } from "react-router";
import { LogOut, DashboardIcon, CalendarDays, InvoiceIcon, DocumentIcon, MessageSquare, TrophyIcon, VerifiedDocIcon, ExpenseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicBranding } from "@/features/company-settings";
import { FeedbackFab } from "@/features/feedback";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/portal", label: "Panel", icon: DashboardIcon },
  { path: "/portal/rentals", label: "Rentas", icon: CalendarDays },
  { path: "/portal/quotes", label: "Cotizaciones", icon: VerifiedDocIcon },
  { path: "/portal/invoices", label: "Facturas", icon: InvoiceIcon },
  { path: "/portal/estado-cuenta", label: "Estado de Cuenta", icon: ExpenseIcon },
  { path: "/portal/contracts", label: "Contratos", icon: DocumentIcon },
  { path: "/portal/mis-reportes", label: "Mis Reportes", icon: MessageSquare },
  { path: "/portal/leaderboard", label: "Tabla de Honor", icon: TrophyIcon },
];

export default function CustomerPortalLayout() {
  const { user, signOut } = useAuth();
  const { data: company } = usePublicBranding();
  const location = useLocation();
  const navigate = useNavigateTransition();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b bg-card flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt="Logo" className="h-8 w-8 rounded object-contain" />
          ) : (
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              {company?.razon_social?.charAt(0) || "LG"}
            </div>
          )}
          <span className="font-semibold text-foreground">Lift Go - Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Cerrar Sesión
          </Button>
        </div>
      </header>

      <nav className="border-b bg-card px-6">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const isActive =
              tab.path === "/portal"
                ? location.pathname === "/portal"
                : location.pathname.startsWith(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
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

      <main className="flex-1 overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <Outlet />
      </main>
      <FeedbackFab />
    </div>
  );
}
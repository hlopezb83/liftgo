import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

// Etiquetas de segmentos comunes (es-MX). Si no está en el mapa se capitaliza el slug.
const SEGMENT_LABELS: Record<string, string> = {
  "": "Inicio",
  fleet: "Equipos",
  bookings: "Reservas",
  calendar: "Calendario",
  deliveries: "Entregas",
  returns: "Devoluciones",
  "return-inspections": "Devoluciones",
  damage: "Daños",
  maintenance: "Mantenimiento",
  inventory: "Refacciones",
  crm: "CRM",
  customers: "Clientes",
  quotes: "Cotizaciones",
  contracts: "Contratos",
  invoices: "Facturas",
  expenses: "Gastos",
  reports: "Reportes",
  "income-statement": "Estado de Resultados",
  mrr: "MRR",
  suppliers: "Proveedores",
  activity: "Actividad",
  audit: "Bitácora",
  users: "Usuarios",
  "role-permissions": "Permisos",
  "company-settings": "Datos Fiscales",
  "operations-setup": "Configuración",
  changelog: "Changelog",
  help: "Ayuda",
  settings: "Configuración",
  operations: "Operaciones",
  company: "Empresa",
  new: "Nuevo",
  edit: "Editar",
};

function labelFor(seg: string): string {
  if (seg in SEGMENT_LABELS) return SEGMENT_LABELS[seg];
  // IDs largos / UUIDs / números → usar #abreviado
  if (/^[0-9a-f-]{20,}$/i.test(seg) || /^\d+$/.test(seg)) {
    return `#${seg.slice(0, 6)}`;
  }
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}

export function TopbarBreadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  // Inicio sólo
  if (segments.length === 0) {
    return (
      <nav aria-label="Ruta" className="flex items-center text-sm text-muted-foreground">
        <Home className="h-3.5 w-3.5" />
        <span className="ml-1.5 font-medium text-foreground">Panel</span>
      </nav>
    );
  }

  const crumbs = segments.map((seg, i) => {
    const path = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    return { label: labelFor(seg), path, isLast };
  });

  return (
    <nav aria-label="Ruta" className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
      <Link to="/" className="hover:text-foreground transition-colors flex items-center" aria-label="Inicio">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((c) => (
        <span key={c.path} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
          {c.isLast ? (
            <span className="font-medium text-foreground truncate">{c.label}</span>
          ) : (
            <Link to={c.path} className="hover:text-foreground transition-colors truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

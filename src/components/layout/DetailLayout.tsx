import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import type { ReactNode } from "react";

export interface DetailSection {
  /** Identificador estable para React key. */
  id: string;
  /** Título opcional de la sección (heading semántico). */
  title?: string;
  /** Contenido renderizado dentro del contenedor. */
  content: ReactNode;
  /** Si es `false`, se omite (útil para secciones condicionales por rol). */
  visible?: boolean;
  /** Extra className para el wrapper de la sección. */
  className?: string;
}

interface DetailLayoutProps {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  backTo: string;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  sections: DetailSection[];
}

/**
 * Layout declarativo para páginas de detalle: header estándar + secciones.
 * Reemplaza la composición manual de `DetailPageHeader` + `<div className="space-y-6">…</div>`
 * que hoy se repite en cada módulo (Facturas, Reservas, CRM, Cotizaciones, etc.).
 */
export function DetailLayout({
  title,
  subtitle,
  badges,
  backTo,
  actions,
  primaryAction,
  sections,
}: DetailLayoutProps) {
  return (
    <PageTransition>
      <div className="p-4 sm:p-6 space-y-6">
        <DetailPageHeader
          title={title}
          subtitle={subtitle}
          badges={badges}
          backTo={backTo}
          actions={actions}
          primaryAction={primaryAction}
        />
        {sections
          .filter((s) => s.visible !== false)
          .map((s) => (
            <section
              key={s.id}
              className={s.className}
              aria-labelledby={s.title ? `section-${s.id}` : undefined}
            >
              {s.title && (
                <h2
                  id={`section-${s.id}`}
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
                >
                  {s.title}
                </h2>
              )}
              {s.content}
            </section>
          ))}
      </div>
    </PageTransition>
  );
}

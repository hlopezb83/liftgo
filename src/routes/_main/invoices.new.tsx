import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ReactElement } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const InvoiceForm = lazy(() => import("@/features/invoices/pages/InvoiceForm"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Facturas";
const minAccess: "read" | "full" | undefined = "full";

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <InvoiceForm />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/invoices/new")({
  head: () => ({ meta: [
    { title: "Nueva factura | Lift GO" },
    { name: "description", content: "Prepara una factura de Lift GO con las reservas y su siguiente periodo pendiente de renta." },
    { property: "og:title", content: "Nueva factura | Lift GO" },
    { property: "og:description", content: "Captura y revisa los periodos de renta antes de facturar en Lift GO." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GuardedRoute,
});

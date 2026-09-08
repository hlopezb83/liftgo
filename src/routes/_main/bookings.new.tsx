import { lazy, Suspense, type ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { AdminRouteGuard } from "@/layouts/AdminRouteGuard";
import { RoleGuard } from "@/layouts/RoleGuard";

const BookingForm = lazy(() => import("@/features/bookings/pages/BookingForm"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Reservas";
const minAccess: "read" | "full" | undefined = "full";
const adminOnly = true;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <BookingForm />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  if (adminOnly) element = <AdminRouteGuard module={module}>{element}</AdminRouteGuard>;
  return element;
}

export const Route = createFileRoute("/_main/bookings/new")({
  component: GuardedRoute,
});

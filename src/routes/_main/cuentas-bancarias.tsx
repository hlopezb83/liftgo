import { lazy, Suspense, type ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const BankAccountsPage = lazy(() => import("@/features/bank-reconciliation/pages/BankAccountsPage"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Cuentas Bancarias";
const minAccess: "read" | "full" | undefined = undefined;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <BankAccountsPage />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/cuentas-bancarias")({
  component: GuardedRoute,
});

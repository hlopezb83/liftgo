import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/layouts/AuthGuard";
import MainLayout from "@/layouts/MainLayout";

/**
 * Layout raíz del ERP autenticado. `AuthGuard` puede desviar a `AuthPage`
 * (sin sesión) o al portal de cliente antes de renderizar el `<Outlet />`
 * del `MainLayout` — mismo comportamiento que el AuthLayout previo.
 */
function MainAuthLayout() {
  return (
    <AuthGuard>
      <MainLayout />
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_main")({
  component: MainAuthLayout,
});

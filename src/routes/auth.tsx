import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

/**
 * AUTH-REC-01: ruta pública explícita para login y para el enlace de
 * recuperación (`redirectTo: ${origin}/auth`). No pasa por `AuthGuard`, así
 * que el formulario de nueva contraseña no puede ser expulsado por una
 * sesión de recuperación ya establecida.
 */
const AuthPage = lazy(() => import("@/features/auth/pages/AuthPage"));

export const Route = createFileRoute("/auth")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <AuthPage />
    </Suspense>
  ),
});

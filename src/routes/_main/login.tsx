import { createFileRoute } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/router-compat";
import { Navigate } from "@/lib/router-compat-ui";

/**
 * GUI-FE-09 (G-UX-08) + G-C3: destino tras el login — honra `?redirect=` sólo
 * si es una ruta interna (empieza con "/" y no con "//", evita open redirects).
 * Sin sesión, AuthGuard muestra la pantalla de login inline; con sesión,
 * "/" resuelve el módulo correcto por rol vía HomeRedirect.
 */
function LoginRedirect() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect");
  const safe = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
  return <Navigate to={safe} replace />;
}

export const Route = createFileRoute("/_main/login")({
  component: LoginRedirect,
});

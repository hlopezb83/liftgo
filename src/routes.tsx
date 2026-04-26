// Re-export para compatibilidad con imports existentes (`@/routes`).
// La configuración real vive en `@/lib/routes-config` para evitar el warning
// de react-refresh al mezclar componentes lazy con constantes.
export { appRoutes, PageFallback, type RouteConfig } from "@/lib/routes-config";

export type AuthMode = "sign-in" | "forgot" | "reset";

export function getAuthSubmitLabel(loading: boolean, mode: AuthMode): string {
  if (loading) return "Cargando...";
  if (mode === "forgot") return "Enviar Enlace";
  if (mode === "reset") return "Actualizar Contraseña";
  return "Iniciar Sesión";
}

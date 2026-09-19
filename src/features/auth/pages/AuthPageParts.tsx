import { BrandLockup, GLOBAL_BRAND_NAME } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AuthMode } from "../components/AuthForm";

const TITLES: Record<AuthMode, { title: string; desc: string }> = {
  "sign-in": { title: "Iniciar Sesión", desc: "Ingresa a Lift Go" },
  forgot: {
    title: "Restablecer Contraseña",
    desc: "Ingresa tu correo para recibir un enlace",
  },
  reset: { title: "Nueva contraseña", desc: "Ingresa tu nueva contraseña" },
};

/** Enlace de recuperación en validación o inválido: nunca se muestra el formulario. */
function RecoveryNotice({
  status,
  onRequestNew,
}: {
  status: "pending" | "error";
  onRequestNew: () => void;
}) {
  if (status === "pending") {
    return (
      <p className="text-sm text-center text-muted-foreground">
        Validando tu enlace de recuperación…
      </p>
    );
  }
  return (
    <div className="space-y-3 text-center">
      <p role="alert" className="text-sm text-destructive">
        El enlace para restablecer tu contraseña es inválido o ya expiró.
        Solicita uno nuevo para continuar.
      </p>
      <Button className="w-full touch:min-h-11" onClick={onRequestNew}>
        Solicitar un enlace nuevo
      </Button>
    </div>
  );
}

/** Encabezado con la marca global de LiftGo y el título del modo actual. */
function AuthCardHeader({
  mode,
  unknownPath,
  pathname,
}: {
  mode: AuthMode;
  unknownPath: boolean;
  pathname: string;
}) {
  return (
    <CardHeader className="text-center pt-8 pb-2">
      <div className="flex justify-center mb-5 items-center gap-3">
        <BrandLockup size="lg" />
        <span className="sr-only">{GLOBAL_BRAND_NAME}</span>
      </div>
      <CardTitle className="auth-display text-xl font-extrabold">
        {TITLES[mode].title}
      </CardTitle>
      <CardDescription>{TITLES[mode].desc}</CardDescription>
      {unknownPath && (
        <p className="text-xs text-muted-foreground mt-2">
          La página «{pathname}» no existe o requiere sesión. Inicia sesión para
          continuar.
        </p>
      )}
    </CardHeader>
  );
}

/** Enlaces secundarios: olvidé mi contraseña, volver, cancelar recuperación. */
function AuthModeLinks({
  mode,
  recovery,
  onMode,
  onCancelRecovery,
}: {
  mode: AuthMode;
  recovery: string;
  onMode: (m: AuthMode) => void;
  onCancelRecovery: () => void;
}) {
  return (
    <div className="mt-4 text-center space-y-1">
      {mode === "sign-in" && (
        <Button
          variant="link"
          className="touch:min-h-11"
          onClick={() => onMode("forgot")}
        >
          ¿Olvidaste tu contraseña?
        </Button>
      )}
      {mode !== "sign-in" && recovery === "idle" && (
        <Button
          variant="link"
          className="touch:min-h-11"
          onClick={() => onMode("sign-in")}
        >
          Volver a Iniciar Sesión
        </Button>
      )}
      {recovery !== "idle" && (
        <Button
          variant="link"
          className="touch:min-h-11"
          onClick={onCancelRecovery}
        >
          Cancelar y volver a Iniciar Sesión
        </Button>
      )}
    </div>
  );
}

export { AuthCardHeader, AuthModeLinks, RecoveryNotice };

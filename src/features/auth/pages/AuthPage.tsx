import { useState, type FormEvent as ReactFormEvent } from "react";
import { AuthBrandPanel } from "@/components/branding/AuthBrandPanel";
import { UsersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentVersion } from "@/features/changelog";
import { usePublicBranding } from "@/features/company-settings";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useLocation } from "@/lib/router-compat";
import { dismissAuthError, notifyAuthError, notifySuccess } from "@/lib/ui/appFeedback";
import { AuthForm, type AuthMode } from "../components/AuthForm";
import { useRecoveryStatus } from "../hooks/useRecoveryStatus";
import { endRecovery, getRecoveryUserId } from "../recoverySession";

const TITLES: Record<AuthMode, { title: string; desc: string }> = {
  "sign-in": { title: "Iniciar Sesión", desc: "Ingresa a Lift Go" },
  forgot: { title: "Restablecer Contraseña", desc: "Ingresa tu correo para recibir un enlace" },
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


/** Encabezado con logo/marca y título del modo actual. */
function AuthCardHeader({
  company,
  mode,
  unknownPath,
  pathname,
}: {
  company: { logo_url?: string | null; razon_social?: string | null } | null | undefined;
  mode: AuthMode;
  unknownPath: boolean;
  pathname: string;
}) {
  return (
    <CardHeader className="text-center pt-8 pb-2">
      <div className="flex justify-center mb-5">
        {company?.logo_url ? (
          <img
            src={company.logo_url}
            alt={`Logo ${company.razon_social ?? "LiftGo"}`}
            className="h-14 w-auto max-w-[200px] object-contain"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-lg shadow-primary/25">LG</div>
        )}
      </div>
      <CardTitle>{TITLES[mode].title}</CardTitle>
      <CardDescription>{TITLES[mode].desc}</CardDescription>
      {unknownPath && (
        <p className="text-xs text-muted-foreground mt-2">
          La página «{pathname}» no existe o requiere sesión. Inicia sesión para continuar.
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
        <Button variant="link" className="touch:min-h-11" onClick={() => onMode("forgot")}>¿Olvidaste tu contraseña?</Button>
      )}
      {mode !== "sign-in" && recovery === "idle" && (
        <Button variant="link" className="touch:min-h-11" onClick={() => onMode("sign-in")}>Volver a Iniciar Sesión</Button>
      )}
      {recovery !== "idle" && (
        <Button variant="link" className="touch:min-h-11" onClick={onCancelRecovery}>
          Cancelar y volver a Iniciar Sesión
        </Button>
      )}
    </div>
  );
}


export default function AuthPage() {
  const { user, signIn, signOut, resetPassword, updatePassword } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigateTransition();
  const recovery = useRecoveryStatus();
  // Link roto sin sesión: el AuthGuard cae aquí silenciosamente — damos un
  // hint de que la ruta no existe (o requiere sesión) en vez de un login seco.
  const unknownPath = recovery === "idle" && pathname !== "/" && pathname !== "/login" && pathname !== "/auth";
  const { data: company } = usePublicBranding();
  const [mode, setMode] = useState<AuthMode>(recovery === "idle" ? "sign-in" : "reset");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentVersion = useCurrentVersion();

  /**
   * P3: `/auth` es una ruta pública que NO pasa por `AuthGuard`, así que con
   * sesión válida hay que salir de ella. El destino por rol lo sigue
   * decidiendo el guard de `/` (los clientes acaban en `/portal`).
   */
  function leaveAuthRoute() {
    if (pathname === "/auth") navigate("/");
  }


  // AUTH-REC-01: el modo sigue al estado del flujo (estado derivado en render,
  // no un efecto tardío que dejaría un frame con el formulario equivocado).
  const [prevRecovery, setPrevRecovery] = useState(recovery);
  if (prevRecovery !== recovery) {
    setPrevRecovery(recovery);
    setMode(recovery === "idle" ? "sign-in" : "reset");
  }

  /**
   * P4: al terminar el flujo de forma explícita (cancelar, pedir enlace nuevo,
   * éxito) hay que sincronizar `prevRecovery`; si no, la transición a `idle`
   * volvía a forzar `sign-in` y pisaba el modo elegido (p. ej. `forgot`).
   */
  const finishRecovery = (nextMode: AuthMode) => {
    endRecovery();
    setPrevRecovery("idle");
    setMode(nextMode);
  };

  // Sólo con la sesión de recuperación CONFIRMADA se permite cambiar la
  // contraseña; así un enlace inválido no aprovecha otra sesión ya abierta.
  // P1b: además de `active`, la sesión ACTUAL debe seguir siendo la del
  // usuario cuya recuperación se confirmó (otra pestaña puede cambiar de
  // cuenta y el SDK sincroniza la sesión entre pestañas).
  const recoverySessionMatches = recovery === "active" && !!user && user.id === getRecoveryUserId();
  const canSubmitReset = recoverySessionMatches;

  const cancelRecovery = async () => {
    setPassword("");
    // Sólo se cierra la sesión cuando ES la de recuperación (`active`).
    // Con `pending`/`error` puede haber una sesión ajena previa: no se toca.
    if (recoverySessionMatches) await signOut();
    finishRecovery("sign-in");
  };

  const runSubmit = async () => {
    // Hallazgo 3: un intento nuevo descarta el error del intento anterior
    // (el toast crítico es persistente y sobrevivía al login exitoso).
    dismissAuthError();
    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) notifyAuthError({ error });
      else notifySuccess("Revisa tu correo para restablecer tu contraseña");
      return;
    }
    if (mode === "reset") {
      if (!canSubmitReset) return;
      const { error } = await updatePassword(password);
      if (error) { notifyAuthError({ error }); return; }
      notifySuccess("Contraseña actualizada");
      setPassword("");
      finishRecovery("sign-in");
      // P3: /auth es pública y queda fuera del guard; sin navegar el usuario
      // se quedaba viendo el login pese a tener sesión válida.
      leaveAuthRoute();
      return;
    }
    const { error } = await signIn(email, password);
    if (error) notifyAuthError({ error });
    else { dismissAuthError(); leaveAuthRoute(); }
  };


  const handleSubmit = async (e: ReactFormEvent) => {
    e.preventDefault();
    setLoading(true);
    await runSubmit();
    setLoading(false);
  };


  return (
    <main className="min-h-[100dvh] flex">
      <AuthBrandPanel
        logoUrl={company?.logo_url}
        razonSocial={company?.razon_social}
        tagline="Opera tu flota de montacargas sin fricción."
      />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md animate-fade-in shadow-lg">
        <AuthCardHeader company={company} mode={mode} unknownPath={unknownPath} pathname={pathname} />
        <CardContent>
          {recovery === "error" || recovery === "pending" ? (
            <RecoveryNotice
              status={recovery}
              onRequestNew={() => { finishRecovery("forgot"); }}
            />

          ) : (

            <AuthForm
              mode={mode}
              email={email}
              password={password}
              showPassword={showPassword}
              loading={loading}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
              onSubmit={handleSubmit}
            />
          )}
          <AuthModeLinks
            mode={mode}
            recovery={recovery}
            onMode={setMode}
            onCancelRecovery={() => { void cancelRecovery(); }}
          />

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">o</span></div>
          </div>
          <Button variant="outline" className="w-full touch:min-h-11" onClick={() => navigate("/portal/login")}>
            <UsersIcon className="mr-2 h-4 w-4" /> Portal de Clientes
          </Button>
          {currentVersion && (
            <p className="mt-4 text-center text-3xs text-muted-foreground/60 font-mono">v{currentVersion}</p>
          )}
        </CardContent>
      </Card>
      </div>
    </main>
  );
}

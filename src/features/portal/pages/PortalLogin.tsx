import { useState, useEffect, type FormEvent as ReactFormEvent } from "react";
import { CompanyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicBranding } from "@/features/company-settings";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

type Mode = "sign-in" | "forgot";

function getPortalSubmitLabel(loading: boolean, mode: Mode): string {
  if (loading) return "Cargando...";
  if (mode === "forgot") return "Enviar Enlace";
  return "Iniciar Sesión";
}

export default function PortalLogin() {
  const { user, signIn, resetPassword } = useAuth();
  const { data: company } = usePublicBranding();
  const navigate = useNavigateTransition();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: ReactFormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) notifyError({ error, fallback: getAuthErrorMessage(error) });
      else notifySuccess("Revisa tu correo para el enlace de restablecimiento");
    } else {
      const { error } = await signIn(email, password);
      if (error) notifyError({ error, fallback: getAuthErrorMessage(error) });
    }
    setLoading(false);
  };

  return (
    // Oleada 3 (C-2): facelift con gradiente radial suave + footer "Powered by".
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,hsl(var(--accent)/0.12),transparent_60%),radial-gradient(ellipse_at_bottom,hsl(var(--primary)/0.08),transparent_55%)]">
      <Card className="w-full max-w-md shadow-lg border-border/60">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={`Logo ${company.razon_social ?? "LiftGo"}`}
                className="h-14 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold text-lg">
                {(company?.razon_social ?? "LG").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <CardTitle>{mode === "forgot" ? "Restablecer contraseña" : "Portal de clientes"}</CardTitle>
          <CardDescription>
            {mode === "forgot"
              ? "Ingresa tu correo para recibir un enlace de restablecimiento."
              : "Inicia sesión para consultar tus rentas, facturas y contratos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">Correo electrónico</Label>
              <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" required />
            </div>
            {mode === "sign-in" && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Contraseña</Label>
                <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading} data-testid="auth-submit">
              {getPortalSubmitLabel(loading, mode)}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" ? (
              <Button variant="link" size="sm" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</Button>
            ) : (
              <Button variant="link" size="sm" onClick={() => setMode("sign-in")}>Volver a iniciar sesión</Button>
            )}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">o</span></div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"}>
            <CompanyIcon className="mr-2 h-4 w-4" /> Acceso empleados
          </Button>
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">LiftGo</span>
      </p>
    </div>
  );
}

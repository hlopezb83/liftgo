import { useState, useCallback } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { useCurrentVersion } from "@/features/changelog";
import { usePublicBranding } from "@/features/company-settings";
import { useAuthPasswordRecoveryListener } from "../hooks/useAuthPasswordRecoveryListener";
import { AuthForm, type AuthMode } from "../components/AuthForm";

const TITLES: Record<AuthMode, { title: string; desc: string }> = {
  "sign-in": { title: "Iniciar Sesión", desc: "Ingresa a Lift Go" },
  forgot: { title: "Restablecer Contraseña", desc: "Ingresa tu correo para recibir un enlace" },
  reset: { title: "Nueva Contraseña", desc: "Ingresa tu nueva contraseña" },
};

export default function AuthPage() {
  const { signIn, resetPassword, updatePassword } = useAuth();
  const { data: company } = usePublicBranding();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentVersion = useCurrentVersion();

  useAuthPasswordRecoveryListener(useCallback(() => setMode("reset"), []));

  const runSubmit = async () => {
    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) notifyError({ error: error });
      else toast.success("Revisa tu correo para restablecer tu contraseña");
      return;
    }
    if (mode === "reset") {
      const { error } = await updatePassword(password);
      if (error) { notifyError({ error: error }); return; }
      toast.success("Contraseña actualizada");
      setMode("sign-in");
      return;
    }
    const { error } = await signIn(email, password);
    if (error) notifyError({ error: error });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await runSubmit();
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md animate-fade-in">
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
        </CardHeader>
        <CardContent>
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
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" && (
              <Button variant="link" size="sm" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</Button>
            )}
            {mode !== "sign-in" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Volver a Iniciar Sesión</Button>
            )}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">o</span></div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/portal/login"}>
            <Users className="mr-2 h-4 w-4" /> Portal de Clientes
          </Button>
          {currentVersion && (
            <p className="mt-4 text-center text-[10px] text-muted-foreground/60 font-mono">v{currentVersion}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

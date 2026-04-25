import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ExternalLink } from "lucide-react";

type Mode = "sign-in" | "forgot" | "reset";

export default function AuthPage() {
  const { signIn, resetPassword, updatePassword } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) toast.error(error.message);
      else toast.success("Revisa tu correo para restablecer tu contraseña");
    } else if (mode === "reset") {
      const { error } = await updatePassword(password);
      if (error) toast.error(error.message);
      else { toast.success("Contraseña actualizada"); setMode("sign-in"); }
    } else {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    }
    setLoading(false);
  };

  const titles: Record<Mode, { title: string; desc: string }> = {
    "sign-in": { title: "Iniciar Sesión", desc: "Ingresa a Lift Go" },
    forgot: { title: "Restablecer Contraseña", desc: "Ingresa tu correo para recibir un enlace" },
    reset: { title: "Nueva Contraseña", desc: "Ingresa tu nueva contraseña" },
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center pt-8 pb-2">
          <div className="flex justify-center mb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-lg shadow-primary/25">LG</div>
          </div>
          <CardTitle>{titles[mode].title}</CardTitle>
          <CardDescription>{titles[mode].desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label>Correo Electrónico</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" required />
              </div>
            )}
            {(mode === "sign-in" || mode === "reset") && (
              <div className="space-y-1.5">
                <Label>{mode === "reset" ? "Nueva Contraseña" : "Contraseña"}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : mode === "forgot" ? "Enviar Enlace" : mode === "reset" ? "Actualizar Contraseña" : "Iniciar Sesión"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" && (
              <Button variant="link" size="sm" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</Button>
            )}
            {mode === "forgot" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Volver a Iniciar Sesión</Button>
            )}
            {mode === "reset" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Volver a Iniciar Sesión</Button>
            )}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">o</span></div>
          </div>
          {mode === "sign-in" && (
            <Button
              type="button"
              variant="outline"
              className="w-full mb-2"
              onClick={async () => {
                const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
                if (result.error) toast.error(result.error.message);
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              Continuar con Google
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/portal/login"}>
            <ExternalLink className="mr-2 h-4 w-4" /> Portal de Clientes
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

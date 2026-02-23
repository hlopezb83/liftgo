import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink } from "lucide-react";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

export default function AuthPage() {
  const { signIn, signUp, resetPassword, updatePassword } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
    } else if (mode === "sign-up") {
      const { error } = await signUp(email, password, fullName);
      if (error) toast.error(error.message);
      else toast.success("Revisa tu correo para confirmar tu cuenta");
    } else {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    }
    setLoading(false);
  };

  const titles: Record<Mode, { title: string; desc: string }> = {
    "sign-in": { title: "Iniciar Sesión", desc: "Ingresa a Lift Go" },
    "sign-up": { title: "Crear Cuenta", desc: "Crea tu cuenta en Lift Go" },
    forgot: { title: "Restablecer Contraseña", desc: "Ingresa tu correo para recibir un enlace" },
    reset: { title: "Nueva Contraseña", desc: "Ingresa tu nueva contraseña" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
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
            {mode === "sign-up" && (
              <div className="space-y-1.5">
                <Label>Nombre Completo</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
              </div>
            )}
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label>Correo Electrónico</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" required />
              </div>
            )}
            {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
              <div className="space-y-1.5">
                <Label>{mode === "reset" ? "Nueva Contraseña" : "Contraseña"}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : mode === "forgot" ? "Enviar Enlace" : mode === "reset" ? "Actualizar Contraseña" : mode === "sign-up" ? "Registrarse" : "Iniciar Sesión"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" && (
              <>
                <Button variant="link" size="sm" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</Button>
                <br />
                <Button variant="link" onClick={() => setMode("sign-up")}>¿No tienes cuenta? Regístrate</Button>
              </>
            )}
            {mode === "sign-up" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>¿Ya tienes cuenta? Inicia Sesión</Button>
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
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/portal/login"}>
            <ExternalLink className="mr-2 h-4 w-4" /> Portal de Clientes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

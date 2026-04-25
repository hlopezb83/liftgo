import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { lovable } from "@/integrations/lovable";

type Mode = "sign-in" | "forgot";

export default function PortalLogin() {
  const { user, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/portal", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) toast.error(error.message);
      else toast.success("Revisa tu correo para el enlace de restablecimiento");
    } else {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold text-lg">CP</div>
          </div>
          <CardTitle>{mode === "forgot" ? "Restablecer Contraseña" : "Portal de Clientes"}</CardTitle>
          <CardDescription>
            {mode === "forgot"
              ? "Ingresa tu correo para recibir un enlace de restablecimiento"
              : "Inicia sesión para acceder a tus rentas, facturas y contratos"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Correo Electrónico</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" required />
            </div>
            {mode === "sign-in" && (
              <div className="space-y-1.5">
                <Label>Contraseña</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : mode === "forgot" ? "Enviar Enlace" : "Iniciar Sesión"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" ? (
              <Button variant="link" size="sm" onClick={() => setMode("forgot")}>¿Olvidaste tu contraseña?</Button>
            ) : (
              <Button variant="link" size="sm" onClick={() => setMode("sign-in")}>Volver a Iniciar Sesión</Button>
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
                const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/portal` });
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
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"}>
            <Building2 className="mr-2 h-4 w-4" /> Acceso Empleados
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState, useEffect } from "react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Building2 } from "lucide-react";
import { usePublicBranding } from "@/features/company-settings";

type Mode = "sign-in" | "forgot";

function getPortalSubmitLabel(loading: boolean, mode: Mode): string {
  if (loading) return "Cargando...";
  if (mode === "forgot") return "Enviar Enlace";
  return "Iniciar Sesión";
}

export default function PortalLogin() {
  const { user, signIn, resetPassword } = useAuth();
  const { data: company } = usePublicBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      if (error) notifyError({ error: error });
      else notifySuccess("Revisa tu correo para el enlace de restablecimiento");
    } else {
      const { error } = await signIn(email, password);
      if (error) notifyError({ error: error });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={`Logo ${company.razon_social ?? "LiftGo"}`}
                className="h-14 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold text-lg">CP</div>
            )}
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
              {getPortalSubmitLabel(loading, mode)}
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
          <Button variant="outline" className="w-full" onClick={() => window.location.href = "/"}>
            <Building2 className="mr-2 h-4 w-4" /> Acceso Empleados
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
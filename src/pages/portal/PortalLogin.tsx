import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
      else toast.success("Check your email for a password reset link");
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
          <CardTitle>{mode === "forgot" ? "Reset Password" : "Customer Portal"}</CardTitle>
          <CardDescription>
            {mode === "forgot"
              ? "Enter your email to receive a reset link"
              : "Sign in to access your rentals, invoices & contracts"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            {mode === "sign-in" && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : mode === "forgot" ? "Send Reset Link" : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" ? (
              <Button variant="link" size="sm" onClick={() => setMode("forgot")}>Forgot password?</Button>
            ) : (
              <Button variant="link" size="sm" onClick={() => setMode("sign-in")}>Back to Sign In</Button>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Staff member?{" "}
            <a href="/" className="underline hover:text-foreground">Sign in here</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

export default function AuthPage() {
  const { signIn, signUp, resetPassword, updatePassword } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  // Detect recovery token in URL (password reset link clicked)
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
      else toast.success("Check your email for a password reset link");
    } else if (mode === "reset") {
      const { error } = await updatePassword(password);
      if (error) toast.error(error.message);
      else { toast.success("Password updated successfully"); setMode("sign-in"); }
    } else if (mode === "sign-up") {
      const { error } = await signUp(email, password, fullName);
      if (error) toast.error(error.message);
      else toast.success("Check your email to confirm your account");
    } else {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    }
    setLoading(false);
  };

  const titles: Record<Mode, { title: string; desc: string }> = {
    "sign-in": { title: "Sign In", desc: "Sign in to ForkliftERP" },
    "sign-up": { title: "Create Account", desc: "Create your ForkliftERP account" },
    forgot: { title: "Reset Password", desc: "Enter your email to receive a reset link" },
    reset: { title: "New Password", desc: "Enter your new password" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">FL</div>
          </div>
          <CardTitle>{titles[mode].title}</CardTitle>
          <CardDescription>{titles[mode].desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "sign-up" && (
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
              </div>
            )}
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
            )}
            {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
              <div className="space-y-1.5">
                <Label>{mode === "reset" ? "New Password" : "Password"}</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : mode === "forgot" ? "Send Reset Link" : mode === "reset" ? "Update Password" : mode === "sign-up" ? "Sign Up" : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-1">
            {mode === "sign-in" && (
              <>
                <Button variant="link" size="sm" onClick={() => setMode("forgot")}>Forgot password?</Button>
                <br />
                <Button variant="link" onClick={() => setMode("sign-up")}>Need an account? Sign Up</Button>
              </>
            )}
            {mode === "sign-up" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Already have an account? Sign In</Button>
            )}
            {mode === "forgot" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Back to Sign In</Button>
            )}
            {mode === "reset" && (
              <Button variant="link" onClick={() => setMode("sign-in")}>Back to Sign In</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

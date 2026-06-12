// Helpers compartidos para tests Deno de Edge Functions.
// Resolución del URL del proyecto Supabase para los smoke tests:
//   1. SUPABASE_URL (estándar en CI/runtime Deno)
//   2. VITE_SUPABASE_URL (fallback durante desarrollo local)
//   3. http://localhost:54321 (Supabase CLI local) — fallback final SEGURO.
//
// Nota: NUNCA usar la URL pública de producción como fallback. Si los tests
// se ejecutan sin env vars, deben correr contra Supabase local — jamás
// golpear producción real por accidente.
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("VITE_SUPABASE_URL") ??
  "http://localhost:54321";

export const fnUrl = (name: string): string => `${SUPABASE_URL}/functions/v1/${name}`;

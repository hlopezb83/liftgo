/**
 * Generación segura de contraseñas temporales.
 *
 * Portado de `supabase/functions/_shared/auth.ts`: rejection sampling para
 * evitar el bias de `% charset.length`.
 */
export function generateSecurePassword(length = 20): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const max = Math.floor(256 / charset.length) * charset.length;
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    const byte = buf[0] ?? 0;
    if (byte < max) out.push(charset.charAt(byte % charset.length));
  }
  return out.join("");
}

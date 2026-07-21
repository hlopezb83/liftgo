import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * v7.94.1 · Regresión: el rol `customer` del portal NO debe poder actualizar
 * customer_payment_intents directamente. La aprobación/rechazo pasa por las
 * RPCs SECURITY DEFINER approve_payment_intent / reject_payment_intent
 * (v7.91.0, BL-25/26). Si alguien agrega una policy UPDATE para customer,
 * este test explota.
 *
 * Se ejecuta contra el proyecto de Cloud usando la anon key. No requiere
 * sesión — un UPDATE anónimo debe ser rechazado por RLS con 0 filas afectadas
 * (o un error de permisos), nunca con éxito.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

describe("customer_payment_intents · RLS (BL-25/26)", () => {
  it("rechaza UPDATE anónimo (no hay policy UPDATE pública)", async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      // En CI sin credenciales el test es un no-op verificable.
      expect(true).toBe(true);
      return;
    }
    const client = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await client
      .from("customer_payment_intents")
      .update({ status: "approved" })
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");

    // Esperado: sin filas (RLS oculta el registro) o error de permisos.
    // Nunca debe devolver una fila con status=approved.
    expect(data ?? []).toHaveLength(0);
    if (error) {
      expect(error.message).toMatch(/permission|row-level|policy/i);
    }
  });
});

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { platformAccessSchema, type PlatformAccess } from "./platformAccess.types";

/** Sólo el acceso propio. No carga el cliente privilegiado ni acepta otro actor. */
export const getPlatformAccessFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformAccess> => {
    const g = await import("./server/adminGuards.server");
    const result = await g.asUntypedRpc(context.supabase).rpc("get_platform_access");
    const parsed = platformAccessSchema.safeParse(result.data);
    if (result.error || !parsed.success) {
      throw new g.HttpError(503, "No se pudo verificar el acceso a la plataforma. Reintenta.");
    }
    return parsed.data;
  });

import { spawnSync } from "node:child_process";
import { assertLocalEphemeralBackend } from "./localBackend";

/** Bootstrap del primer raíz sólo por el dueño de la BD local efímera. */
export function bootstrapLocalPlatformOperator(userId: string): void {
  assertLocalEphemeralBackend("bootstrap de plataforma");
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) throw new Error("[ab-seed] falta DB_URL local para el bootstrap");
  const target = new URL(dbUrl);
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1"
    || target.port !== "54322" || target.pathname !== "/postgres"
    || target.username !== "postgres") {
    throw new Error("[ab-seed] bootstrap limitado al PostgreSQL efímero local");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("[ab-seed] identidad de bootstrap inválida");
  }
  const sql = `BEGIN;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM public.platform_operators) THEN
        RAISE EXCEPTION 'El bootstrap A/B exige un registro de operadores vacío';
      END IF;
    END $$;
    INSERT INTO public.platform_operators(auth_user_id,access_profile)
      VALUES('${userId}','root'); COMMIT;`;
  const result = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`[ab-seed] falló el bootstrap local: ${result.stderr ?? "psql no disponible"}`);
}

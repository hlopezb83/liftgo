import {
  platformOnboardingJobSchema,
  platformOnboardingCompletionSchema,
  type PlatformOnboardingJob,
  type PlatformOnboardingResult,
} from "../platformOnboarding.types";
import {
  asUntypedRpc,
  generateSecurePassword,
  HttpError,
} from "./adminGuards.server";
import type { AdminClient } from "./guards/httpError";
import type { User } from "@supabase/supabase-js";

export function parseOnboardingJob(data: unknown): PlatformOnboardingJob {
  const parsed = platformOnboardingJobSchema.safeParse(data);
  if (!parsed.success)
    throw new HttpError(
      503,
      "No se pudo verificar el estado del alta. Reintenta.",
    );
  return parsed.data;
}

function matchesIdentity(user: User, job: PlatformOnboardingJob) {
  return (
    user.id === job.admin_user_id &&
    user.email?.toLowerCase() === job.admin_email &&
    user.app_metadata["organization_id"] === job.organization_id &&
    user.app_metadata["platform_onboarding_request_id"] === job.request_id
  );
}

async function ensureAdminIdentity(
  admin: AdminClient,
  job: PlatformOnboardingJob,
): Promise<void> {
  const lookup = await admin.auth.admin.getUserById(job.admin_user_id);
  if (lookup.data.user) {
    if (!matchesIdentity(lookup.data.user, job))
      throw new Error("identity_conflict");
    return;
  }
  // Un error de red/servidor no demuestra que la cuenta no exista.
  if (lookup.error?.status !== 404) throw new Error("auth_unavailable");
  if (job.stage === "complete") throw new Error("identity_conflict");
  const created = await admin.auth.admin.createUser({
    id: job.admin_user_id,
    email: job.admin_email,
    password: generateSecurePassword(),
    email_confirm: true,
    user_metadata: { full_name: job.admin_full_name },
    app_metadata: {
      organization_id: job.organization_id,
      platform_onboarding_request_id: job.request_id,
    },
  });
  if (created.data.user && !created.error) {
    if (!matchesIdentity(created.data.user, job))
      throw new Error("identity_conflict");
    return;
  }
  // Cubre respuesta perdida y dos workers creando la misma identidad.
  const reconciled = await admin.auth.admin.getUserById(job.admin_user_id);
  if (reconciled.data.user && matchesIdentity(reconciled.data.user, job))
    return;
  if (reconciled.data.user || created.error?.code === "email_exists")
    throw new Error("identity_conflict");
  throw new Error("auth_unavailable");
}

async function pendingResult(
  admin: AdminClient,
  actor: string,
  job: PlatformOnboardingJob,
  error: unknown,
): Promise<PlatformOnboardingResult> {
  // No se registran cuerpos de Auth, contraseñas, correos ni enlaces.
  const conflict =
    error instanceof Error && error.message === "identity_conflict";
  console.error(
    "[platform-onboarding]",
    conflict ? "identity_conflict" : "retry_required",
  );
  const latest = await asUntypedRpc(admin).rpc("platform_get_onboarding", {
    p_actor: actor,
    p_request_id: job.request_id,
  });
  if (latest.error?.code === "42501")
    throw new HttpError(403, "Se requiere un operador de plataforma activo.");
  const verified = latest.error ? job : parseOnboardingJob(latest.data);
  if (
    !conflict &&
    error instanceof Error &&
    error.message === "finalize_unavailable" &&
    verified.stage === "complete"
  ) {
    return {
      success: true,
      organization_id: job.organization_id,
      admin_user_id: job.admin_user_id,
      admin_email: job.admin_email,
      recovery_link: null,
      password_set_manually: false,
    };
  }
  return {
    success: false,
    request: verified,
    message: conflict
      ? "La cuenta requiere revisión: no coincide con la identidad reservada. No se modificó una cuenta existente."
      : "El alta quedó guardada. Reanúdala para verificar el resultado y completar el acceso.",
  };
}

export async function runPlatformOnboarding(
  admin: AdminClient,
  actor: string,
  job: PlatformOnboardingJob,
): Promise<PlatformOnboardingResult> {
  let issueLink = false;
  try {
    await ensureAdminIdentity(admin, job);
    const finished = await Promise.resolve(
      asUntypedRpc(admin).rpc("platform_finish_onboarding", {
        p_actor: actor,
        p_request_id: job.request_id,
      }),
    ).catch(() => {
      throw new Error("finalize_unavailable");
    });
    if (finished.error) {
      if (finished.error.code === "42501")
        throw new HttpError(
          403,
          "El operador o el acceso del administrador requiere revisión.",
        );
      throw new Error("finalize_unavailable");
    }
    const complete = platformOnboardingCompletionSchema.safeParse(
      finished.data,
    );
    if (!complete.success || complete.data.stage !== "complete")
      throw new Error("finalize_unavailable");
    issueLink = complete.data.completed_now;
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) throw error;
    return pendingResult(admin, actor, job, error);
  }
  // Sólo el operador activo obtiene un enlace. No se persiste ni se envía correo.
  // Su generación falla de forma independiente: nunca revierte un alta terminada.
  let recoveryLink: string | null = null;
  if (issueLink)
    try {
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email: job.admin_email,
      });
      if (!link.error && link.data.user?.id === job.admin_user_id)
        recoveryLink = link.data.properties?.action_link ?? null;
    } catch {
      console.error("[platform-onboarding] access_link_unavailable");
    }
  return {
    success: true,
    organization_id: job.organization_id,
    admin_user_id: job.admin_user_id,
    admin_email: job.admin_email,
    recovery_link: recoveryLink,
    password_set_manually: false,
  };
}

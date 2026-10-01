import { z } from "zod";

export const platformOnboardingInputSchema = z
  .object({
    request_id: z.uuid(),
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    admin_email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    admin_full_name: z.string().trim().min(1).max(200),
  })
  .strict();
export const platformOnboardingRequestSchema = z
  .object({ request_id: z.uuid() })
  .strict();
export const platformOnboardingPageInputSchema = z
  .object({
    offset: z.number().int().min(0).max(100_000).default(0),
  })
  .strict();
export const platformOnboardingJobSchema = z.object({
  request_id: z.uuid(),
  organization_id: z.uuid(),
  admin_user_id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  admin_email: z.string(),
  admin_full_name: z.string(),
  stage: z.enum(["auth_pending", "admin_pending", "complete"]),
  created_at: z.string(),
});
export const platformOnboardingPageSchema = z.object({
  jobs: z.array(platformOnboardingJobSchema),
  total: z.number().int().nonnegative(),
});
export type PlatformOnboardingJob = z.infer<typeof platformOnboardingJobSchema>;
export type PlatformOnboardingInput = z.infer<
  typeof platformOnboardingInputSchema
>;
export type PlatformOnboardingPage = z.infer<
  typeof platformOnboardingPageSchema
>;

export interface CompletedOnboarding {
  success: true;
  organization_id: string;
  admin_user_id: string;
  admin_email: string;
  recovery_link: string | null;
  password_set_manually: false;
}
export type PlatformOnboardingResult =
  | CompletedOnboarding
  | {
      success: false;
      request: PlatformOnboardingJob;
      message: string;
    };

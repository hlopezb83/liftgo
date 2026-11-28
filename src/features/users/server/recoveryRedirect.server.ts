/** Destination owned by server configuration, never by an administrator's payload. */
export function getRecoveryRedirect(): string {
  // Reuse the portal's deployment setting and published-site default.
  const site = new URL(process.env["PORTAL_SITE_URL"] ?? "https://liftgo.lovable.app");
  if (!["https:", "http:"].includes(site.protocol) || site.username || site.password) {
    throw new Error("Invalid recovery site configuration");
  }
  return new URL("/auth?type=recovery", site.origin).href;
}

/** Manual-password invitations do not issue links or depend on recovery config. */
export function getInviteRecoveryRedirect(password?: string): string | undefined {
  return password ? undefined : getRecoveryRedirect();
}

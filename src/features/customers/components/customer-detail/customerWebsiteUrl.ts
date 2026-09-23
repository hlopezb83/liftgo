/** A web address typed without a scheme should still be usable, never executable. */
export function customerWebsiteUrl(website: string): string | null {
  const value = website.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

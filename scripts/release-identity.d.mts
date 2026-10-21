export interface ReleaseIdentity { version: string; sourceSha256: string }
export function sourceIdentity(root: string): Promise<string>;
export function assertReleaseIdentity(manifest: unknown, bundleIdentity: unknown, expected?: ReleaseIdentity): void;
export function validatedBuildIdentity(root: string): Promise<ReleaseIdentity>;

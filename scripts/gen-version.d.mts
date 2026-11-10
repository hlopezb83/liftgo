import type { ReleaseIdentity } from './release-identity.mjs';

export const RECENT_COUNT: number;
export function generateVersion(root: string): Promise<ReleaseIdentity & { generatedAt: string; recentCount: number }>;
export function prepareBuildIdentity(root: string): Promise<ReleaseIdentity>;
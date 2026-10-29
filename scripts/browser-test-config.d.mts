import type { LaunchOptions } from '@playwright/test';

export const FAKE_BACKEND: Readonly<Record<string, string>>;
export function assertLocalBaseURL(value: string): URL;
export function assertEffectiveBindings<T extends Record<string, unknown>>(bindings: T): T;
export function assertBuildUsesFakeBackend(root: string, productionRefs?: readonly string[]): void;
export function browserLaunchOptions(proxyURL: string, executablePath?: string): LaunchOptions;

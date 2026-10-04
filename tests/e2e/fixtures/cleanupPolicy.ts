export function isShardedRun(
  env: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv,
): boolean {
  return Boolean(env.SHARD_INDEX || env.PLAYWRIGHT_SHARD || env.E2E_KEEP_SEED_FLAG === "1"
    || argv.some((argument) => argument.startsWith("--shard")));
}

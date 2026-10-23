import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit source inputs only. Never enumerate .env, credentials or caches.
export const SOURCE_DIRECTORIES = ['src', 'public', 'scripts', 'supabase/functions', 'drizzle/migrations'];
export const SOURCE_FILES = ['package.json', 'bun.lock', 'vite.config.ts', 'tsconfig.json', 'wrangler.jsonc'];
const GENERATED = new Set(['public/version.json', 'public/changelog-recent.json']);
const SKIP_NAMES = new Set(['node_modules', '.git', '.state', '.auth', '.aws', '.ssh', '.secrets']);
// Artifact exclusions are repository-relative, never feature basenames.
const ARTIFACT_PATHS = new Set(['dist', 'reports', 'test-results']);
const MAX_FILES = 30_000;
const MAX_BYTES = 512 * 1024 * 1024;

export async function sourceIdentity(root) {
  const files = [];
  let bytes = 0;
  async function visit(relative) {
    const name = path.posix.basename(relative);
    if (GENERATED.has(relative) || ARTIFACT_PATHS.has(relative) || SKIP_NAMES.has(name) || name.startsWith('.env') || name.endsWith('.log')
      || /\.(?:pem|key|p12|pfx)$/i.test(name) || name === 'credentials.json') return;
    const stat = await lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Release input is a symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const child of (await readdir(path.join(root, relative))).sort()) await visit(`${relative}/${child}`);
    } else if (stat.isFile()) {
      bytes += stat.size;
      if (files.length >= MAX_FILES || bytes > MAX_BYTES) throw new Error('Release inputs exceed the bounded source budget');
      files.push(relative);
    } else throw new Error(`Unsupported release input: ${relative}`);
  }
  for (const input of [...SOURCE_DIRECTORIES, ...SOURCE_FILES]) await visit(input);
  const hash = createHash('sha256').update('liftgo-source-v1\n');
  for (const relative of files.sort()) {
    const content = createHash('sha256');
    for await (const chunk of createReadStream(path.join(root, relative))) content.update(chunk);
    hash.update(`${relative}\0${content.digest('hex')}\n`);
  }
  return hash.digest('hex');
}

/** Refuse stale prebuild metadata even when Vite is invoked directly. */
export async function validatedBuildIdentity(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/version.json'), 'utf8'));
  const entries = JSON.parse(await readFile(path.join(root, 'public/changelog.json'), 'utf8'));
  const actual = await sourceIdentity(root);
  assertReleaseIdentity(manifest, actual, { version: entries[0].version, sourceSha256: actual });
  return manifest;
}

export function assertReleaseIdentity(manifest, bundleIdentity, expected) {
  const sha = /^[a-f0-9]{64}$/;
  if (!manifest || !sha.test(manifest.sourceSha256 ?? '') || !/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) {
    throw new Error('Missing or invalid release identity');
  }
  if (bundleIdentity !== manifest.sourceSha256) throw new Error('Bundle and manifest identities differ');
  if (expected) {
    if (!sha.test(expected.sourceSha256 ?? '') || !/^\d+\.\d+\.\d+$/.test(expected.version ?? '')) {
      throw new Error('Expected release must have an explicit valid version and sourceSha256');
    }
    if (manifest.sourceSha256 !== expected.sourceSha256 || manifest.version !== expected.version) {
      throw new Error('Published release differs from the approved source identity');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.');
  const entries = JSON.parse(await readFile(path.join(root, 'public/changelog.json'), 'utf8'));
  console.log(JSON.stringify({ version: entries[0].version, sourceSha256: await sourceIdentity(root) }));
}

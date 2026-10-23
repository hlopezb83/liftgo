import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validatedBuildIdentity, sourceIdentity, SOURCE_DIRECTORIES, SOURCE_FILES, assertReleaseIdentity } from '../release-identity.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'liftgo-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of SOURCE_DIRECTORIES) await mkdir(path.join(root, directory), { recursive: true });
  for (const file of SOURCE_FILES) await writeFile(path.join(root, file), 'source');
  return root;
}

test('deterministic without .git; ignores timestamps, secrets and caches', async (t) => {
  const root = await fixture(t);
  const before = await sourceIdentity(root);
  await writeFile(path.join(root, 'public/version.json'), '{"generatedAt":"later"}');
  await writeFile(path.join(root, '.env'), 'SECRET=never-read');
  await writeFile(path.join(root, 'src/.env.local'), 'SECRET=never-read');
  await writeFile(path.join(root, 'public/private.pem'), 'SECRET=never-read');
  await mkdir(path.join(root, 'src/.aws'));
  await writeFile(path.join(root, 'src/.aws/credentials'), 'SECRET=never-read');
  await mkdir(path.join(root, 'src/node_modules'));
  await writeFile(path.join(root, 'src/node_modules/cache'), 'ignored');
  assert.equal(await sourceIdentity(root), before);
});

for (const file of ['src/money.ts', 'supabase/functions/handler.ts', 'drizzle/migrations/0119.sql', 'vite.config.ts', 'public/changelog.json', 'bun.lock']) {
  test(`identity changes for ${file}`, async (t) => {
    const root = await fixture(t);
    const before = await sourceIdentity(root);
    await writeFile(path.join(root, file), 'changed');
    assert.notEqual(await sourceIdentity(root), before);
  });
}

test('symlinks and missing required roots fail closed', async (t) => {
  const root = await fixture(t);
  await symlink('/outside/not/read', path.join(root, 'src/linked'));
  await assert.rejects(sourceIdentity(root), /symlink/);
  await rm(path.join(root, 'src/linked'));
  await rm(path.join(root, 'bun.lock'));
  await assert.rejects(sourceIdentity(root), /ENOENT/);
});

const current = { version: '8.44.24', sourceSha256: 'a'.repeat(64) };
const old = { version: '8.44.23', sourceSha256: 'b'.repeat(64) };
test('approved exact bundle/manifest passes', () => assertReleaseIdentity(current, current.sourceSha256, current));
test('coherent old release fails explicit approved baseline', () => assert.throws(() => assertReleaseIdentity(old, old.sourceSha256, current), /approved/));
test('cached or mixed manifest and bundle fails', () => assert.throws(() => assertReleaseIdentity(current, old.sourceSha256, current), /differ/));
test('missing manifest/bundle fails', () => {
  for (const manifest of [null, {}, { version: '8.44.24' }]) assert.throws(() => assertReleaseIdentity(manifest, undefined));
  assert.throws(() => assertReleaseIdentity(current, undefined));
});
test('partial or invalid approved baseline fails', () => {
  for (const expected of [{ version: current.version }, { sourceSha256: current.sourceSha256 }, { ...current, sourceSha256: 'bad' }]) {
    assert.throws(() => assertReleaseIdentity(current, current.sourceSha256, expected), /explicit/);
  }
});
test('cron coherence alone is not approval of current main', () => assertReleaseIdentity(old, old.sourceSha256));

test('build refuses stale manifest after a source edit, independent of prebuild hooks', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'public/changelog.json'), JSON.stringify([{ version: '8.44.24' }]));
  const manifest = { version: '8.44.24', sourceSha256: await sourceIdentity(root) };
  await writeFile(path.join(root, 'public/version.json'), JSON.stringify(manifest));
  assert.deepEqual(await validatedBuildIdentity(root), manifest);
  await writeFile(path.join(root, 'src/money.ts'), 'changed after prebuild');
  await assert.rejects(validatedBuildIdentity(root), /identities differ/);
});

for (const directory of ['reports', 'dist', 'test-results']) {
  test(`legitimate nested ${directory} source participates in identity`, async (t) => {
    const root = await fixture(t);
    const file = path.join(root, 'src/features', directory, 'finance.ts');
    const before = await sourceIdentity(root);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'first');
    const added = await sourceIdentity(root);
    assert.notEqual(added, before);
    await writeFile(file, 'second');
    assert.notEqual(await sourceIdentity(root), added);
    await rm(file);
    assert.equal(await sourceIdentity(root), before);
    await mkdir(path.join(root, directory), { recursive: true });
    await writeFile(path.join(root, directory, 'artifact.json'), 'ignored artifact');
    assert.equal(await sourceIdentity(root), before);
  });
}

test('reports edits invalidate a previously generated manifest', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'public/changelog.json'), JSON.stringify([{ version: '8.44.31' }]));
  const manifest = { version: '8.44.31', sourceSha256: await sourceIdentity(root) };
  await writeFile(path.join(root, 'public/version.json'), JSON.stringify(manifest));
  await mkdir(path.join(root, 'src/features/reports'), { recursive: true });
  await writeFile(path.join(root, 'src/features/reports/report.ts'), 'new report');
  await assert.rejects(validatedBuildIdentity(root), /identities differ/);
});
